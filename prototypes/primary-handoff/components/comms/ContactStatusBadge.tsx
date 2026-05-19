"use client";

import { Check, AlertCircle, Clock, XCircle } from "lucide-react";
import type { ContactStatus } from "@/lib/types";

const CONFIG: Record<
  ContactStatus,
  { icon: React.ReactNode; cls: string; label: string }
> = {
  Recent: {
    icon: <Check className="h-3 w-3" />,
    cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
    label: "Recent",
  },
  "Been a While": {
    icon: <Clock className="h-3 w-3" />,
    cls: "bg-amber-100 text-amber-700 border-amber-200",
    label: "Been a While",
  },
  "Contact Needed": {
    icon: <AlertCircle className="h-3 w-3" />,
    cls: "bg-rose-100 text-rose-700 border-rose-200",
    label: "Contact Needed",
  },
  "Never Contacted": {
    icon: <XCircle className="h-3 w-3" />,
    cls: "bg-ink-100 text-ink-600 border-ink-200",
    label: "Never Contacted",
  },
};

export function ContactStatusBadge({
  status,
  size = "sm",
}: {
  status: ContactStatus;
  size?: "sm" | "md";
}) {
  const c = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${
        c.cls
      } ${size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

export function ContactStatusDot({ status }: { status: ContactStatus }) {
  const color = {
    Recent: "bg-emerald-500",
    "Been a While": "bg-amber-500",
    "Contact Needed": "bg-rose-500",
    "Never Contacted": "bg-ink-300",
  }[status];
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      title={status}
    />
  );
}
