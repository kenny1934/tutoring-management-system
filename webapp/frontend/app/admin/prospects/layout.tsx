"use client";

import { AdminTabBar } from "@/components/admin/AdminTabBar";

// The prospect module feeds both the summer and regular intakes, so it lives at
// /admin/prospects rather than under either one. This bar restores a way back to
// both sections and marks Prospects as the active area; the Summer/Regular tabs
// deep-link to each intake but highlight on its section root.
const tabs = [
  { name: "Summer", href: "/admin/summer/applications", match: "/admin/summer" },
  { name: "Regular", href: "/admin/regular/applications", match: "/admin/regular" },
  { name: "Prospects", href: "/admin/prospects" },
];

export default function AdminProspectsLayout({ children }: { children: React.ReactNode }) {
  return <AdminTabBar tabs={tabs}>{children}</AdminTabBar>;
}
