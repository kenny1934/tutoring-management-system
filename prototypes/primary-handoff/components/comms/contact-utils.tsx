"use client";

import {
  MessageCircle,
  Phone,
  Users,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import type { ContactMethod, ContactType } from "@/lib/types";

export const CONTACT_METHODS: ContactMethod[] = [
  "WhatsApp",
  "Phone",
  "In-Person",
];
export const CONTACT_TYPES: ContactType[] = [
  "Progress Update",
  "Concern",
  "General",
];

export function MethodIcon({
  method,
  className = "h-4 w-4",
}: {
  method: ContactMethod;
  className?: string;
}) {
  if (method === "WhatsApp")
    return <MessageCircle className={`${className} text-emerald-600`} />;
  if (method === "Phone") return <Phone className={`${className} text-blue-600`} />;
  return <Users className={`${className} text-purple-600`} />;
}

export function TypeIcon({
  type,
  className = "h-3 w-3",
}: {
  type: ContactType;
  className?: string;
}) {
  if (type === "Progress Update") return <TrendingUp className={className} />;
  if (type === "Concern") return <AlertTriangle className={className} />;
  return <MessageCircle className={className} />;
}

export function typeBadgeCls(type: ContactType) {
  if (type === "Progress Update") return "bg-blue-100 text-blue-700";
  if (type === "Concern") return "bg-orange-100 text-orange-700";
  return "bg-ink-100 text-ink-700";
}
