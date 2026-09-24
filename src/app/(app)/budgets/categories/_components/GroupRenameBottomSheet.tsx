"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ServerActionResult } from "@/lib/errorUtils";
import { CATEGORY_GROUP_LABELS } from "@/lib/constants";
import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  onClose: () => void;
  oldGroup: string;
  onSuccess: () => void;
  renameMutation: UseMutationResult<
    ServerActionResult<void>,
    Error,
    { oldName: string; newName: string },
    unknown
  >;
}

export function GroupRenameBottomSheet({
  open,
  onClose,
  oldGroup,
  onSuccess,
  renameMutation,
}: Props) {
  const t = useTranslations("categories");
  const [visible, setVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNewName(oldGroup || "");
      setError(null);
      requestAnimationFrame(() => setVisible(true));
    }
  }, [open, oldGroup]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setError(null);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedNew = newName.trim();
    if (!trimmedNew) {
      setError("Group name cannot be empty.");
      return;
    }

    if (trimmedNew === oldGroup) {
      handleClose();
      return;
    }

    renameMutation.mutate(
      { oldName: oldGroup, newName: trimmedNew },
      {
        onSuccess: (res) => {
          if (!res.success) {
            setError(res.message ?? "Something went wrong.");
            return;
          }
          onSuccess();
          handleClose();
        },
      }
    );
  }

  if (!open && !visible) return null;
  
  const displayOldGroup = CATEGORY_GROUP_LABELS[oldGroup as keyof typeof CATEGORY_GROUP_LABELS] ?? oldGroup;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 cursor-pointer transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />
      <div
        className="fixed bottom-0 left-1/2 w-full max-w-md bg-white rounded-t-3xl z-50 shadow-2xl transition-transform duration-300 max-h-[90vh] overflow-y-auto"
        style={{ transform: visible ? "translate(-50%, 0)" : "translate(-50%, 100%)" }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">{t("renameGroup")}</h2>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4 bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={`Rename group (current: ${displayOldGroup})`}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("typeNewGroup")}
              disabled={renameMutation.isPending}
              required
            />

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={renameMutation.isPending}
            >
              {renameMutation.isPending ? "Saving..." : "Save Group Name"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
