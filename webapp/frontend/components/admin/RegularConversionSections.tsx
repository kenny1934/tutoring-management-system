"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntentionBadge, OutreachBadge } from "@/components/summer/prospect-badges";
import type { ProspectOutreachStatus, RegularConversionResponse } from "@/types";

// Shared table styling, matching the funnel table already on the page.
const wrap = "border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 rounded-lg overflow-hidden";
const scroll = "overflow-x-auto";
const thead = "bg-[#f0e6d8]/50 dark:bg-[#2a2520]";
const theadRow = "border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30";
const th = "px-3 py-2 text-left font-medium text-foreground";
const thNum = "px-3 py-2 text-right font-medium text-foreground";
const tdNum = "px-3 py-2 text-right tabular-nums";
const rowDivide = "divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30";

/** Whole-number percent, guarding a zero denominator. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "-";
}

function EmptyRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="px-3 py-4 text-center text-muted-foreground italic">{children}</td>
    </tr>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5 mb-2">{subtitle}</p>
      {children}
    </section>
  );
}

function IntentionTables({ data }: { data: RegularConversionResponse }) {
  return (
    <Section
      title="Stated intention vs outcome"
      subtitle="How many prospects at each stated intention went on to apply and enrol."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Regular intention -> applied / enrolled regular */}
        <div className={wrap}>
          <div className={scroll}>
            <table className="w-full text-xs min-w-[360px]">
              <thead className={thead}>
                <tr className={theadRow}>
                  <th className={th}>Wants regular</th>
                  <th className={thNum}>Prospects</th>
                  <th className={thNum}>Applied</th>
                  <th className={thNum}>Enrolled</th>
                  <th className={thNum} title="Enrolled as a share of prospects at this intention">Rate</th>
                </tr>
              </thead>
              <tbody className={rowDivide}>
                {data.by_regular_intention.map((r) => (
                  <tr key={r.intention}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.intention}</td>
                    <td className={tdNum}>{r.prospects}</td>
                    <td className={cn(tdNum, "text-indigo-600")}>{r.applied_regular}</td>
                    <td className={cn(tdNum, "text-purple-600")}>{r.enrolled_regular}</td>
                    <td className={cn(tdNum, "text-muted-foreground")}>{pct(r.enrolled_regular, r.prospects)}</td>
                  </tr>
                ))}
                {data.by_regular_intention.length === 0 && <EmptyRow span={5}>No prospects.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summer intention -> attended summer */}
        <div className={wrap}>
          <div className={scroll}>
            <table className="w-full text-xs min-w-[360px]">
              <thead className={thead}>
                <tr className={theadRow}>
                  <th className={th}>Wants summer</th>
                  <th className={thNum}>Prospects</th>
                  <th className={thNum}>Did summer</th>
                  <th className={thNum} title="Did summer as a share of prospects at this intention">Rate</th>
                </tr>
              </thead>
              <tbody className={rowDivide}>
                {data.by_summer_intention.map((r) => (
                  <tr key={r.intention}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.intention}</td>
                    <td className={tdNum}>{r.prospects}</td>
                    <td className={cn(tdNum, "text-emerald-600")}>{r.attended_summer}</td>
                    <td className={cn(tdNum, "text-muted-foreground")}>{pct(r.attended_summer, r.prospects)}</td>
                  </tr>
                ))}
                {data.by_summer_intention.length === 0 && <EmptyRow span={4}>No prospects.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Section>
  );
}

function SchoolTable({ data }: { data: RegularConversionResponse }) {
  return (
    <Section title="Feeder schools" subtitle="Which schools the prospects come from, and how far each school converts.">
      <div className={wrap}>
        <div className={cn(scroll, "max-h-72 overflow-y-auto")}>
          <table className="w-full text-xs min-w-[420px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <th className={th}>School</th>
                <th className={thNum}>Prospects</th>
                <th className={thNum}>Applied</th>
                <th className={thNum}>Enrolled</th>
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {data.by_school.map((r) => (
                <tr key={r.school}>
                  <td className="px-3 py-2 text-foreground max-w-[280px] truncate" title={r.school}>{r.school}</td>
                  <td className={tdNum}>{r.prospects}</td>
                  <td className={cn(tdNum, "text-indigo-600")}>{r.applied_regular}</td>
                  <td className={cn(tdNum, "text-purple-600")}>{r.enrolled_regular}</td>
                </tr>
              ))}
              {data.by_school.length === 0 && <EmptyRow span={4}>No prospects.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function TutorTable({ data }: { data: RegularConversionResponse }) {
  return (
    <Section title="By submitting tutor" subtitle="Which P6 tutors bring in prospects that go on to apply and enrol.">
      <div className={wrap}>
        <div className={cn(scroll, "max-h-72 overflow-y-auto")}>
          <table className="w-full text-xs min-w-[460px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <th className={th}>Branch</th>
                <th className={th}>Tutor</th>
                <th className={thNum}>Prospects</th>
                <th className={thNum}>Applied</th>
                <th className={thNum}>Enrolled</th>
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {data.by_tutor.map((r, i) => (
                <tr key={`${r.branch}-${r.tutor_name}-${i}`}>
                  <td className="px-3 py-2 font-semibold text-foreground">{r.branch}</td>
                  <td className={cn("px-3 py-2", r.tutor_name === "Unattributed" ? "text-muted-foreground italic" : "text-foreground")}>{r.tutor_name}</td>
                  <td className={tdNum}>{r.prospects}</td>
                  <td className={cn(tdNum, "text-indigo-600")}>{r.applied_regular}</td>
                  <td className={cn(tdNum, "text-purple-600")}>{r.enrolled_regular}</td>
                </tr>
              ))}
              {data.by_tutor.length === 0 && <EmptyRow span={5}>No prospects.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function MovementTable({ data }: { data: RegularConversionResponse }) {
  // A crossing is a concrete named branch that differs from where they enrolled.
  const isCrossing = (wanted: string, enrolled: string) =>
    wanted !== "None" && wanted !== enrolled && enrolled !== "Unknown";
  return (
    <Section
      title="Branch preference vs where they enrolled"
      subtitle="Enrolled prospects by the branch they named against the branch they actually joined. Highlighted rows crossed to a branch they did not name."
    >
      <div className={wrap}>
        <div className={scroll}>
          <table className="w-full text-xs min-w-[360px]">
            <thead className={thead}>
              <tr className={theadRow}>
                <th className={th}>Wanted</th>
                <th className="px-1 py-2" aria-hidden />
                <th className={th}>Enrolled at</th>
                <th className={thNum}>Students</th>
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {data.branch_movement.map((r, i) => {
                const crossing = isCrossing(r.wanted_branch, r.enrolled_branch);
                return (
                  <tr key={`${r.wanted_branch}-${r.enrolled_branch}-${i}`} className={crossing ? "bg-amber-50/60 dark:bg-amber-900/15" : ""}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.wanted_branch}</td>
                    <td className="px-1 py-2 text-muted-foreground"><ArrowRight className="h-3 w-3" /></td>
                    <td className={cn("px-3 py-2 font-medium", crossing ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>{r.enrolled_branch}</td>
                    <td className={tdNum}>{r.count}</td>
                  </tr>
                );
              })}
              {data.branch_movement.length === 0 && <EmptyRow span={4}>No enrolled prospects yet.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function LostTable({ data }: { data: RegularConversionResponse }) {
  const rows = data.lost_prospects;
  return (
    <Section
      title={`Still to chase (${rows.length})`}
      subtitle="Prospects with no regular application yet. Open one to record outreach."
    >
      <div className={wrap}>
        <div className={cn(scroll, "max-h-80 overflow-y-auto")}>
          <table className="w-full text-xs min-w-[640px]">
            <thead className={cn(thead, "sticky top-0")}>
              <tr className={theadRow}>
                <th className={th}>Name</th>
                <th className={th}>Branch</th>
                <th className={th}>Grade</th>
                <th className={th}>School</th>
                <th className={th}>Wants regular</th>
                <th className={th}>Did summer</th>
                <th className={th}>Outreach</th>
              </tr>
            </thead>
            <tbody className={rowDivide}>
              {rows.map((r) => (
                <tr key={r.prospect_id} className="hover:bg-primary/[0.04]">
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/admin/prospects?focus=${r.prospect_id}&year=${data.year}`}
                      className="text-primary hover:underline"
                      title="Open this prospect"
                    >
                      {r.student_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground">{r.source_branch}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.grade || "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate" title={r.school || undefined}>{r.school || "-"}</td>
                  <td className="px-3 py-2">
                    {r.wants_regular
                      ? <IntentionBadge value={r.wants_regular} />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.attended_summer
                      ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Did summer" />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.outreach_status
                      ? <OutreachBadge status={r.outreach_status as ProspectOutreachStatus} />
                      : <span className="text-muted-foreground/50">-</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <EmptyRow span={7}>Every prospect has a regular application.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

/** The deeper conversion axes, stacked below the funnel + grade-stream summary:
 *  stated intention vs outcome, feeder schools, submitting tutor, branch
 *  preference vs where they enrolled, and the still-to-chase list. */
export function RegularConversionSections({ data }: { data: RegularConversionResponse }) {
  return (
    <>
      <IntentionTables data={data} />
      <MovementTable data={data} />
      <SchoolTable data={data} />
      <TutorTable data={data} />
      <LostTable data={data} />
    </>
  );
}
