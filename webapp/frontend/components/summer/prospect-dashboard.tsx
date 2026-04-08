"use client";

import { Search } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { BRANCH_INFO } from "@/lib/summer-utils";
import { IntentionBadge } from "@/components/summer/prospect-badges";
import type { PrimaryProspectStats } from "@/types";

export type DashboardFilterPatch = Partial<{
  branch: string;
  status: string;
  outreach_status: string;
  wants_summer: string;
  wants_regular: string;
  linked: string;
}>;

export function ProspectDashboard({
  stats,
  year,
  onJumpToList,
}: {
  stats: PrimaryProspectStats[];
  year: number | null;
  onJumpToList: (patch: DashboardFilterPatch) => void;
}) {
  if (stats.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No data{year != null ? ` for ${year}` : ""}</p>
      </div>
    );
  }

  const totals = stats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      wants_summer_yes: acc.wants_summer_yes + s.wants_summer_yes,
      wants_summer_considering: acc.wants_summer_considering + s.wants_summer_considering,
      wants_regular_yes: acc.wants_regular_yes + s.wants_regular_yes,
      wants_regular_considering: acc.wants_regular_considering + s.wants_regular_considering,
      matched: acc.matched + s.matched_to_application,
      not_started: acc.not_started + s.outreach_not_started,
      wechat_added: acc.wechat_added + s.outreach_wechat_added,
      wechat_issues: acc.wechat_issues + s.outreach_wechat_not_found + s.outreach_wechat_cannot_add,
    }),
    { total: 0, wants_summer_yes: 0, wants_summer_considering: 0, wants_regular_yes: 0, wants_regular_considering: 0, matched: 0, not_started: 0, wechat_added: 0, wechat_issues: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm pb-4 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
        <div><span className="text-2xl font-bold text-foreground">{totals.total}</span> <span className="text-muted-foreground">prospects</span></div>
        <span className="text-border hidden sm:inline">|</span>
        <button onClick={() => onJumpToList({ wants_summer: "Yes" })} className="hover:underline">
          <span className="font-semibold text-green-600">{totals.wants_summer_yes}</span> <span className="text-muted-foreground">summer yes</span>{" "}
          <span className="text-yellow-600 text-xs">+{totals.wants_summer_considering}</span>
        </button>
        <button onClick={() => onJumpToList({ wants_regular: "Yes" })} className="hover:underline">
          <span className="font-semibold text-blue-600">{totals.wants_regular_yes}</span> <span className="text-muted-foreground">regular yes</span>{" "}
          <span className="text-yellow-600 text-xs">+{totals.wants_regular_considering}</span>
        </button>
        <span className="text-border hidden sm:inline">|</span>
        <button onClick={() => onJumpToList({ outreach_status: "WeChat - Added" })} className="inline-flex items-center gap-1 hover:underline">
          <span className="font-semibold text-green-600">{totals.wechat_added}</span> <WeChatIcon className="h-3 w-3 text-green-600" /> <span className="text-muted-foreground">added</span>
        </button>
        <button onClick={() => onJumpToList({ outreach_status: "WeChat - Not Found" })} className="inline-flex items-center gap-1 hover:underline">
          <span className="text-red-600">{totals.wechat_issues}</span> <WeChatIcon className="h-3 w-3 text-red-500" /> <span className="text-muted-foreground">issues</span>
        </button>
        <span className="text-border hidden sm:inline">|</span>
        <button onClick={() => onJumpToList({ linked: "linked" })} className="hover:underline">
          <span className="font-semibold text-purple-600">{totals.matched}</span> <span className="text-muted-foreground">matched</span>
        </button>
        <button onClick={() => onJumpToList({ outreach_status: "Not Started" })} className="hover:underline">
          <span className="text-muted-foreground">{totals.not_started} not started</span>
        </button>
      </div>

      <div className="border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-[#f0e6d8]/50 dark:bg-[#2a2520]">
            <tr className="border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
              <th rowSpan={2} className="px-3 py-1.5 text-left font-medium text-foreground align-bottom">Branch</th>
              <th rowSpan={2} className="px-3 py-1.5 text-right font-medium text-foreground align-bottom">Total</th>
              <th colSpan={2} className="px-3 py-1 text-center font-medium text-foreground text-[10px] uppercase tracking-wider">Summer</th>
              <th colSpan={2} className="px-3 py-1 text-center font-medium text-foreground text-[10px] uppercase tracking-wider">Regular</th>
              <th colSpan={2} className="px-3 py-1 text-center font-medium text-foreground align-bottom"><WeChatIcon className="h-3 w-3 inline text-green-600" /></th>
              <th rowSpan={2} className="px-3 py-1.5 text-right font-medium text-foreground align-bottom cursor-help" title="Linked to a summer application">Matched</th>
              <th rowSpan={2} className="px-3 py-1.5 text-right font-medium text-foreground align-bottom cursor-help" title="Outreach not yet attempted">Not Started</th>
            </tr>
            <tr>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Yes" /></th>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Considering" /></th>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Yes" /></th>
              <th className="px-3 py-1 text-right"><IntentionBadge value="Considering" /></th>
              <th className="px-3 py-1 text-right text-[10px] text-green-600 font-medium">Added</th>
              <th className="px-3 py-1 text-right text-[10px] text-red-600 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
            {stats.map((s, i) => (
              <tr key={s.branch} className={`cursor-pointer hover:bg-primary/5 ${i % 2 === 1 ? "bg-[#f5efe7]/30 dark:bg-[#222]" : ""}`} onClick={() => onJumpToList({ branch: s.branch })}>
                <td className="px-3 py-2 font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${BRANCH_INFO[s.branch]?.dot || "bg-gray-400"}`} />
                    {s.branch}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium">{s.total}</td>
                <td className="px-3 py-2 text-right text-green-600 font-medium">{s.wants_summer_yes}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{s.wants_summer_considering}</td>
                <td className="px-3 py-2 text-right text-blue-600 font-medium">{s.wants_regular_yes}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{s.wants_regular_considering}</td>
                <td className="px-3 py-2 text-right text-green-600">{s.outreach_wechat_added}</td>
                <td className="px-3 py-2 text-right text-red-600">{s.outreach_wechat_not_found + s.outreach_wechat_cannot_add}</td>
                <td className="px-3 py-2 text-right text-purple-600 font-medium">{s.matched_to_application}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{s.outreach_not_started}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-[#f0e6d8]/50 dark:bg-[#2a2520] font-semibold border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
            <tr>
              <td className="px-3 py-2 text-foreground">Total</td>
              <td className="px-3 py-2 text-right">{totals.total}</td>
              <td className="px-3 py-2 text-right text-green-600">{totals.wants_summer_yes}</td>
              <td className="px-3 py-2 text-right text-yellow-600">{totals.wants_summer_considering}</td>
              <td className="px-3 py-2 text-right text-blue-600">{totals.wants_regular_yes}</td>
              <td className="px-3 py-2 text-right text-yellow-600">{totals.wants_regular_considering}</td>
              <td className="px-3 py-2 text-right text-green-600">{totals.wechat_added}</td>
              <td className="px-3 py-2 text-right text-red-600">{totals.wechat_issues}</td>
              <td className="px-3 py-2 text-right text-purple-600">{totals.matched}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{totals.not_started}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
