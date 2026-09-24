# bf-7m3 — Edit account type (Tipe Akun) in edit mode

**Bead:** `bf-7m3` (hub beads, label `befin`, parent `app-s4hm.1`). Mode B (direct): 4 src files + 2 i18n files, ~40 lines.

## Goal

`AccountBottomSheet` shows the "Account type" picker only in create mode. Show it in edit mode too, persist the change, and validate on the server that the new type belongs to the user.

## Immutability audit (done — result: nothing depends on the type being immutable)

`accounts.account_type_id` is an FK to `account_types` (per-user rows `Cash` / `Bank` / `E-wallet`, seeded by `seed_defaults_for_new_user`, see `supabase/migrations/20260723_rename_account_types.sql`). Every consumer checked:

| Thing | Depends on `account_type_id`? | Evidence |
|---|---|---|
| Wallet denominations (`wallet_denominations`) + reality-check page | **No** — keyed on the separate `accounts.is_wallet` flag | `src/app/(app)/accounts/[id]/actions.ts:23,41` (`!account.is_wallet`), `[id]/page.tsx:197,201,219` |
| `is_wallet` | **No** — independent boolean, not derived from type. Not even editable in the sheet UI (state only). | `schema.ts:79`, sheet line 48/109/129 |
| `asset_category` (liquid/investment) | **No** — lives on `accounts`, has its own picker already editable in edit mode. Migration comment confirms: "asset_category ada di tabel accounts, BUKAN account_types" | `schema.ts:71`, migration line 5 |
| `investment_group` | **No** — derived from name / explicit column | `src/lib/investment.ts`, `queries/accounts.ts:136` |
| `accountVisuals` (logo/colour) | **No** — keyed on account **name** | `src/lib/accountVisuals.ts` `getAccountVisual(name)` |
| `isBankAccount(slug)` (superscript currency) | Yes, reads `account_type_slug` — but compares to `"atm"`, a slug renamed to `"bank"` in bf-vgh, so it currently **never matches** (pre-existing bug, see Open questions). Changing type has no effect today. | `accountVisuals.ts:85-87`, `AccountCard.tsx:14`, `CalculationBalanceCard.tsx:29` |
| Balances / RPC `apply_transaction_balances` | **No** | `supabase/migrations/20260722_apply_transaction_balances.sql` |
| Transactions / goals / wishlist / assets queries | **No** — grep for `account_type` in `src/` hits only accounts queries/UI | — |
| DB constraints / triggers | Only FK `accounts.account_type_id → account_types.id` (NOT NULL). No trigger reads it. | `schema.ts:62-64`, `supabase/migrations/*` |
| `scripts/migrate-sheet.ts` | Only assigns a default type on insert; never reads it back | line 392-478 |
| Detail header text | Shows `account_type_name` — updates after refetch (edit success already invalidates `accountKeys.detail/list`) | `[id]/page.tsx:162, 117-123` |

**Per transition:** Cash ↔ Bank ↔ E-wallet — all **safe, no cleanup, no warning needed**. The type is a cosmetic label. Liquid ↔ investment is *not* implied by the type field (it's the separate `asset_category` picker, already editable). Wallet-denomination rows stay tied to `is_wallet`, untouched.

**Real risk found = trust boundary:** the FK only checks the type id *exists*, not that it belongs to the user. `createAccountAction` today accepts any other user's `account_type_id` (pre-existing gap). This plan adds the ownership check to **both** create and update.

---

## Step 1 — Query: persist `account_type_id` on update

**File:** `src/db/queries/accounts.ts`, function `updateAccount` (~line 150-175).

`UpdateAccountInput` (= `createAccountSchema.partial()`) already contains `account_type_id`; the query simply drops it. Add one line.

Before:
```ts
  if (input.current_balance !== undefined) values.current_balance = String(input.current_balance);
  if (input.asset_category !== undefined) values.asset_category = input.asset_category;
```
After:
```ts
  if (input.current_balance !== undefined) values.current_balance = String(input.current_balance);
  if (input.account_type_id !== undefined) values.account_type_id = input.account_type_id;
  if (input.asset_category !== undefined) values.asset_category = input.asset_category;
```

No new query function — ownership check reuses the existing `getAccountTypes(userId)` (already filters `where user_id = userId`).

## Step 2 — Server actions: validate type ownership (+ account ownership on update)

**File:** `src/app/(app)/accounts/actions.ts`

### 2a. `createAccountAction`

Before:
```ts
    const parsed = createAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    const id = await createAccount(user.id, parsed.data);
```
After:
```ts
    const parsed = createAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    const types = await getAccountTypes(user.id);
    if (!types.some((type) => type.id === parsed.data.account_type_id)) {
      return { success: false, message: (await getTranslations("accounts"))("invalidAccountType") };
    }

    const id = await createAccount(user.id, parsed.data);
```

### 2b. `updateAccountAction`

Before:
```ts
    const parsed = updateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    await updateAccount(user.id, accountId, parsed.data);
```
After:
```ts
    const parsed = updateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: parsed.error.issues[0].message };
    }

    const t = await getTranslations("accounts");
    const account = await getAccountById(user.id, accountId);
    if (!account) return { success: false, message: t("notFound") };

    if (parsed.data.account_type_id !== undefined) {
      const types = await getAccountTypes(user.id);
      if (!types.some((type) => type.id === parsed.data.account_type_id)) {
        return { success: false, message: t("invalidAccountType") };
      }
    }

    await updateAccount(user.id, accountId, parsed.data);
```

Notes:
- `getAccountTypes`, `getAccountById`, `getTranslations` are already imported in this file — no import changes.
- The `getAccountById` check follows AGENTS.md "verify ownership before mutate" (today a foreign id is a silent no-op success). `notFound` key already exists.
- Zod `uuid("Invalid account type")` message stays literal English (AGENTS.md rule: zod messages are not translated).

## Step 3 — i18n keys

Add to the `accounts` namespace in **both** files (keys must be identical — `src/i18n/__tests__/messages.test.ts`). Add to `en.json` first (type-safe keys come from en).

`src/i18n/messages/en.json` → `accounts`:
```json
"accountType": "Account type",
"invalidAccountType": "Invalid account type."
```
`src/i18n/messages/id.json` → `accounts`:
```json
"accountType": "Tipe akun",
"invalidAccountType": "Tipe akun tidak valid."
```
Place them right after `"selectType"` in each file (keep valid JSON commas).

## Step 4 — `AccountBottomSheet`: show picker in edit, pre-select current type, send diff

**File:** `src/app/(app)/accounts/_components/AccountBottomSheet.tsx`

`AccountRow` has `account_type_slug` but not `account_type_id`. Slug is unique per user (`unique(user_id, slug)` on `account_types`), so resolve the id from the `accountTypes` prop — no query change needed.

### 4a. State init (line 33-35)

Before:
```tsx
  const [accountTypeId, setAccountTypeId] = useState(
    account ? "" : (accountTypes[0]?.id ?? "")
  );
```
After:
```tsx
  // Edit: resolve current type id from slug (unique per user); AccountRow has no account_type_id.
  const originalTypeId = account
    ? (accountTypes.find((type) => type.slug === account.account_type_slug)?.id ?? "")
    : "";
  const [accountTypeId, setAccountTypeId] = useState(
    account ? originalTypeId : (accountTypes[0]?.id ?? "")
  );
```

### 4b. Sync effect (line 69-74) — cover edit mode when `accountTypes` loads after the sheet opens

Before:
```tsx
  useEffect(() => {
    if (mode === "create" && accountTypes.length > 0 && !accountTypeId) {
      setAccountTypeId(accountTypes[0].id);
    }
  }, [accountTypes, mode, accountTypeId]);
```
After:
```tsx
  useEffect(() => {
    if (accountTypes.length === 0 || accountTypeId) return;
    setAccountTypeId(mode === "create" ? accountTypes[0].id : originalTypeId);
  }, [accountTypes, mode, accountTypeId, originalTypeId]);
```

### 4c. Edit submit payload (inside `updateAccountAction(account!.id, { ... })`, line ~118)

Add one property right after `name:`:
```tsx
          account_type_id:
            accountTypeId && accountTypeId !== originalTypeId ? accountTypeId : undefined,
```
(Empty `accountTypeId` = types not loaded yet → `undefined` → type untouched.)

### 4d. Render — drop the create-only guard, translate the label (line 204-218)

Before:
```tsx
          {/* Tipe Akun — hanya saat create */}
          {mode === "create" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipe Akun <span className="text-red-500">*</span>
              </label>
              <SingleSelect
                value={accountTypeId}
                onChange={setAccountTypeId}
                searchable={false}
                options={accountTypes.map((t) => ({ value: t.id, label: t.name }))}
                placeholder={accountTypes.length === 0 ? t("noTypes") : t("selectType")}
              />
            </div>
          )}
```
After:
```tsx
          {/* Account type — create + edit (bf-7m3: cosmetic label, nothing depends on it) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("accountType")} <span className="text-red-500">*</span>
            </label>
            <SingleSelect
              value={accountTypeId}
              onChange={setAccountTypeId}
              searchable={false}
              options={accountTypes.map((type) => ({ value: type.id, label: type.name }))}
              placeholder={accountTypes.length === 0 ? t("noTypes") : t("selectType")}
            />
          </div>
```
(Also renames the shadowing `.map((t) => …)` param to `type` — it shadowed the `t` translator.)

Do NOT translate the other hardcoded Indonesian labels in this sheet (Nama Akun, Kategori Aset, Saldo, …) in this issue — out of scope.

## Step 5 — Docs

- `AGENTS.md`: under `## Asset Category (accounts.asset_category)` append one bullet:
  `- **Account type (`account_type_id` → account_types Cash/Bank/E-wallet) = label kosmetik** — editable saat edit akun (bf-7m3). Tidak ada logic yang bergantung padanya: wallet denominations ikut `is_wallet`, liquid/investment ikut `asset_category`, visual ikut nama. Server wajib cek type milik user (`getAccountTypes`) di create + update.`
- `docs/roadmap.md` line 34 (`B3 | bf-7m3`): change note `edit tipe akun; belum ada plan` → `edit tipe akun; plan docs/plans/2026-09-24-bf-7m3-edit-account-type.md` (mark done after user verifies).
- README: no change (not a user-facing feature worth listing).

## Verification (user runs; Claude does not)

1. `npm run test:run` — `messages.test.ts` green (en/id keys identical).
2. `npm run build` — green (type-safe `t("accountType")`, `t("invalidAccountType")`).
3. Manual, `npm run dev`:
   - `/accounts` → FAB → create sheet: "Account type" picker visible, defaults to first type, create works.
   - Open an account detail `/accounts/<id>` → edit (pencil): picker visible, **pre-selected with the current type** (header subtitle shows the same name).
   - Change Bank → Cash → Save → header subtitle now "Cash - Reality check for …"; balance, reality-check card, and denomination table (if `is_wallet`) unchanged.
   - Edit only the name (type untouched) → save → type still the same (payload sends `account_type_id: undefined`).
   - Wallet account (`is_wallet = true`): change type to Bank → denomination counter still shows, saved counts intact.
   - Switch locale to `id` in `/settings` → label reads "Tipe akun".
4. Server guard (devtools console is not enough — server actions are POST): temporarily call `updateAccountAction(id, { account_type_id: "00000000-0000-0000-0000-000000000000" })` from a scratch client button, or trust code review; expected `{ success: false, message: "Invalid account type." }`. Remove scratch code after.

## Out of scope / follow-ups

- `isBankAccount` compares slug to `"atm"` but the slug was renamed to `"bank"` (bf-vgh) → bank superscript formatting silently dead. See open question; file a separate bead.
- Remaining hardcoded Indonesian strings in `AccountBottomSheet`.
