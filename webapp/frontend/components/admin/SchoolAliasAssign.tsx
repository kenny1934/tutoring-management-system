"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Loader2 } from "lucide-react";
import { regularAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { Autocomplete } from "@/components/ui/autocomplete";

/**
 * The control that teaches the system a school spelling: an input suggesting
 * the known code vocabulary (but accepting free text, so a genuinely new
 * school can still be entered) and a save button that stores the alias.
 * Used wherever staff meet an unrecognised spelling: the stats view's
 * unrecognised-spellings card and the application detail modal.
 */
export function SchoolAliasAssign({ raw, onAssigned, className }: {
  /** The spelling as it appears on the application. Sent verbatim; the
   *  backend folds it into the stored key. */
  raw: string;
  /** Called after a successful save so the caller can refetch and regroup. */
  onAssigned?: () => void;
  className?: string;
}) {
  const { showToast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  // One request shared by every instance on the page; SWR dedupes on the key.
  const { data: codes } = useSWR("regular-school-codes", () => regularAPI.getSchoolCodes());

  const save = async () => {
    const target = value.trim();
    if (!target || saving) return;
    setSaving(true);
    try {
      await regularAPI.createSchoolAlias(raw, target);
      showToast(`"${raw}" now counts as ${target}`, "success");
      onAssigned?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save the school code", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Autocomplete
        value={value}
        onChange={setValue}
        suggestions={codes ?? []}
        // Enter picks the highlighted code first; with nothing highlighted
        // it saves what was typed, same as the button.
        onEnterWithoutHighlight={save}
        placeholder="School code"
        wrapperClassName="relative"
        className="w-36 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-foreground placeholder:text-muted-foreground/60"
      />
      <button
        type="button"
        onClick={save}
        disabled={!value.trim() || saving}
        className="p-1 rounded-md text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
        title="Save this school code"
        aria-label={`Assign a school code to ${raw}`}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
