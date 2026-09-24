"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, Eye, EyeOff } from "lucide-react";
import { signOut } from "@/app/(auth)/signin/actions";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useDashboard } from "../_hooks/useDashboard";
import { updateDisplayNameAction } from "../actions";
import { dashboardKeys } from "@/lib/query";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/lib/constants";

const PLAN_STYLE: Record<PlanTier, string> = {
  free: "bg-gray-100 text-gray-600",
  pro: "bg-blue-100 text-blue-700",
  family: "bg-purple-100 text-purple-700",
};

export default function SettingsPage() {
  const { data, isLoading } = useDashboard();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const hideBalances = usePrivacyStore((s) => s.hideBalances);
  const toggleHide = usePrivacyStore((s) => s.toggleHideBalances);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const planTier = data?.user.planTier ?? "free";
  const planLabel: Record<PlanTier, string> = {
    free: t("planFree"),
    pro: t("planPro"),
    family: t("planFamily"),
  };

  function startEdit() {
    setName(data?.user.displayName ?? "");
    setError(undefined);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      const res = await updateDisplayNameAction(name);
      if (!res.success) {
        setError(res.message);
        return;
      }
      await qc.invalidateQueries({ queryKey: dashboardKeys.all });
      setEditing(false);
    });
  }

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar
            src={data?.user.avatarUrl}
            initials={data?.user.initials ?? ".."}
            className="w-14 h-14 bg-blue-100 text-blue-700 text-lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 truncate">
                {isLoading ? "..." : data?.user.displayName}
              </p>
              <span
                className={cn(
                  "shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold",
                  PLAN_STYLE[planTier]
                )}
              >
                {planLabel[planTier]}
              </span>
            </div>
            <p className="text-sm text-gray-500 truncate">{data?.user.email}</p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              disabled={isLoading}
              aria-label={t("editName")}
              className="shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-100 cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {editing && (
          <div className="space-y-3">
            <Input
              id="display-name"
              label={t("displayName")}
              value={name}
              maxLength={50}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              error={error}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={isPending}
                onClick={() => setEditing(false)}
              >
                {tc("cancel")}
              </Button>
              <Button className="flex-1" disabled={isPending} onClick={save}>
                {isPending ? tc("saving") : tc("save")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{t("hideBalances")}</p>
          <p className="text-sm text-gray-500">{t("hideBalancesHint")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hideBalances}
          aria-label={t("hideBalances")}
          onClick={toggleHide}
          className={cn(
            "shrink-0 p-2 rounded-xl transition-colors cursor-pointer",
            hideBalances ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
          )}
        >
          {hideBalances ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      <LocaleSwitcher />

      <form action={signOut}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 py-3 rounded-2xl text-sm font-medium hover:bg-red-50 transition-colors shadow-sm"
        >
          <LogOut className="w-4 h-4" />
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}
