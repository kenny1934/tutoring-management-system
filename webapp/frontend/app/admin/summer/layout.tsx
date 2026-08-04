"use client";

import { AdminTabBar } from "@/components/admin/AdminTabBar";

const tabs = [
  { name: "Applications", href: "/admin/summer/applications" },
  { name: "Arrangement", href: "/admin/summer/arrangement" },
  { name: "Courseware", href: "/admin/summer/courseware" },
  { name: "Certificates", href: "/admin/summer/certificates" },
  { name: "Prospects", href: "/admin/prospects" },
  { name: "Config", href: "/admin/summer/config" },
];

export default function SummerAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminTabBar tabs={tabs}>{children}</AdminTabBar>;
}
