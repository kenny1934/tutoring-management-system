"use client";

import { AdminTabBar } from "@/components/admin/AdminTabBar";

const tabs = [
  { name: "Applications", href: "/admin/regular/applications" },
  { name: "Arrangement", href: "/admin/regular/arrangement" },
  { name: "Conversion", href: "/admin/regular/conversion" },
  { name: "Retention", href: "/admin/regular/retention" },
  { name: "Prospects", href: "/admin/prospects" },
  { name: "Config", href: "/admin/regular/config" },
];

export default function RegularAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminTabBar tabs={tabs}>{children}</AdminTabBar>;
}
