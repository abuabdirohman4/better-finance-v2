"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2 } from "lucide-react";
import { SingleSelect } from "@/components/ui/MultiSelect";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CATEGORY_GROUP_LABELS } from "@/lib/constants";
import { useTranslations } from "next-intl";
import type { ManageCategoryRow } from "@/db/queries/categories";
import type { UseMutationResult } from "@tanstack/react-query";
import type { UpsertCategoryInput } from "@/lib/schemas/category";
import type { ServerActionResult } from "@/lib/errorUtils";

const NEW_GROUP = "__new__";

interface Props {
  open: boolean;
  onClose: () => void;
  editCategory?: ManageCategoryRow | null;
  existingGroups: string[];
  onSuccess: () => void;
  upsertMutation: UseMutationResult<ServerActionResult<{ id: string }>, Error, UpsertCategoryInput, unknown>;
  deleteMutation: UseMutationResult<ServerActionResult<void>, Error, string, unknown>;
}

export function CategoryBottomSheet({
  open, onClose, editCategory, existingGroups, onSuccess, upsertMutation, deleteMutation,
}: Props) {
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [groupSel, setGroupSel] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(editCategory);

  useEffect(() => {
    if (open) {
      setName(editCategory?.name ?? "");
      setGroupSel(editCategory?.group_name ?? "");
      setNewGroup("");
      setError(null);
      requestAnimationFrame(() => setVisible(true));
    }
  }, [open, editCategory]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setError(null);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  // Group options: known labels + any existing custom groups + "New group"
  const knownGroups = Object.keys(CATEGORY_GROUP_LABELS);
  const allGroups = Array.from(new Set([...knownGroups, ...existingGroups]));
  const groupOptions = [
    { value: NEW_GROUP, label: "+ New group" },
    ...allGroups.map((g) => ({ value: g, label: CATEGORY_GROUP_LABELS[g as keyof typeof CATEGORY_GROUP_LABELS] ?? g })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const finalGroup = groupSel === NEW_GROUP ? newGroup.trim() : groupSel;
    if (!name.trim()) { setError("Category name is required."); return; }
    if (!finalGroup) { setError("Group is required."); return; }

    upsertMutation.mutate(
      { id: editCategory?.id, name: name.trim(), group_name: finalGroup },
      {
        onSuccess: (res) => {
          if (!res.success) { setError(res.message ?? "Something went wrong."); return; }
          onSuccess();
          handleClose();
        },
      }
    );
  }

  function handleDelete() {
    if (!editCategory) return;
    if (!confirm(`Delete "${editCategory.name}"? Past transactions keep this label.`)) return;
    setError(null);
    deleteMutation.mutate(editCategory.id, {
      onSuccess: (res) => {
        if (!res.success) { setError(res.message ?? "Something went wrong."); return; }
        onSuccess();
        handleClose();
      },
    });
  }

  if (!open && !visible) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 cursor-pointer transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }} onClick={handleClose} />
      <div className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 max-h-[90vh] overflow-y-auto"
        style={{ transform: visible ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">{isEdit ? "Edit Category" : "Add Category"}</h2>
            <div className="flex items-center gap-2">
              {isEdit && (
                <button type="button" onClick={handleDelete}
                  disabled={deleteMutation.isPending || upsertMutation.isPending}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <button type="button" onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label={t("nameLabel")} type="text" value={name}
              onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")}
              disabled={upsertMutation.isPending} required />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tc("group")}</label>
              <SingleSelect options={groupOptions} value={groupSel} onChange={setGroupSel}
                placeholder={t("selectGroup")} searchable direction="up" disabled={upsertMutation.isPending} />
            </div>

            {groupSel === NEW_GROUP && (
              <Input label={t("newGroupLabel")} type="text" value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)} placeholder={t("newGroupPlaceholder")}
                disabled={upsertMutation.isPending} />
            )}

            <Button type="submit" className="w-full mt-2"
              disabled={upsertMutation.isPending || deleteMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : "Save Category"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
