"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/controls";

/** A failed request keeps its place in the page and has an explicit recovery action. */
export function NativeRequestError({ label, retry, loading }: {
  label: string; retry: () => void; loading: boolean;
}) {
  return <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 text-sm text-ink-subtle">
    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
    <p className="min-w-0 flex-1 basis-40">{label}</p>
    <Button size="sm" onClick={retry} loading={loading}>Try again</Button>
  </div>;
}
