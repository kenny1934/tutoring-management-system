"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Users, Copy, Check } from "lucide-react";
import { StatusBadge } from "./SummerApplicationCard";
import { PrimaryBranchChip } from "./PrimaryBranchChip";
import { displayLocation } from "@/lib/summer-utils";
import type {
  SummerApplication,
  SummerCourseConfig,
  SummerSiblingInfo,
} from "@/types";
import type { DiscountResult } from "@/lib/summer-discounts";

type Tier = {
  key: string;
  label: string;
  minSize: number;
  amount?: number;
};

// Pull min_group_size discount tiers from the config, sorted ascending.
// Falls back to a simple Paired tier (>=2) when the config has no tiers.
function resolveTiers(config: SummerCourseConfig | null | undefined): Tier[] {
  const raw = config?.pricing_config?.discounts ?? [];
  const tiers: Tier[] = [];
  for (const d of raw) {
    const min = d.conditions?.min_group_size;
    if (typeof min === "number" && min > 1) {
      tiers.push({ key: d.code, label: d.name_en, minSize: min, amount: d.amount });
    }
  }
  tiers.sort((a, b) => a.minSize - b.minSize);
  if (tiers.length === 0) {
    tiers.push({ key: "__paired", label: "Paired", minSize: 2 });
  }
  return tiers;
}

type BuddyGroup = {
  id: number;
  code: string | null;
  memberCount: number;
  members: SummerApplication[];
  declaredSiblings: SummerSiblingInfo[];
  crossBranch: boolean;
  oldestSubmittedAt: string;
};

function buildGroups(apps: SummerApplication[]): {
  groups: BuddyGroup[];
  solo: SummerApplication[];
} {
  const groupMap = new Map<number, BuddyGroup>();
  const solo: SummerApplication[] = [];

  for (const app of apps) {
    if (!app.buddy_group_id) {
      solo.push(app);
      continue;
    }
    let g = groupMap.get(app.buddy_group_id);
    if (!g) {
      g = {
        id: app.buddy_group_id,
        code: app.buddy_code ?? null,
        memberCount: app.buddy_group_member_count ?? 0,
        members: [],
        declaredSiblings: [],
        crossBranch: false,
        oldestSubmittedAt: app.submitted_at ?? "",
      };
      groupMap.set(app.buddy_group_id, g);
    }
    g.members.push(app);
    if (app.buddy_group_member_count != null && app.buddy_group_member_count > g.memberCount) {
      g.memberCount = app.buddy_group_member_count;
    }
    if (app.submitted_at && (!g.oldestSubmittedAt || app.submitted_at < g.oldestSubmittedAt)) {
      g.oldestSubmittedAt = app.submitted_at;
    }
  }

  // Collect declared siblings from each group's first member and dedupe by id.
  // Siblings are repeated across members that share the group, so we just take
  // the first member's list as canonical.
  for (const g of groupMap.values()) {
    const seenIds = new Set<number>();
    for (const m of g.members) {
      for (const s of m.buddy_siblings ?? []) {
        if (s.verification_status === "Rejected") continue;
        if (seenIds.has(s.id)) continue;
        seenIds.add(s.id);
        g.declaredSiblings.push(s);
      }
    }
    const memberLocations = new Set(g.members.map((m) => m.preferred_location).filter(Boolean));
    g.crossBranch = memberLocations.size > 1;
    if (g.memberCount === 0) {
      g.memberCount = g.members.length + g.declaredSiblings.length;
    }
  }

  return { groups: Array.from(groupMap.values()), solo };
}

function groupMatchesFilter(g: BuddyGroup, predicate: (a: SummerApplication) => boolean): boolean {
  return g.members.some(predicate);
}

export function SummerBuddyBoard({
  applications,
  config,
  discountByAppId,
  memberPredicate,
  onSelectApp,
}: {
  applications: SummerApplication[];
  config: SummerCourseConfig | null | undefined;
  discountByAppId: Map<number, DiscountResult>;
  // Predicate applied at the member level — a group is shown if any member
  // passes. Use this to thread the toolbar's status/search/grade filters.
  memberPredicate: (a: SummerApplication) => boolean;
  onSelectApp: (app: SummerApplication) => void;
}) {
  const tiers = useMemo(() => resolveTiers(config), [config]);
  const { groups, solo } = useMemo(() => buildGroups(applications), [applications]);

  const visibleGroups = useMemo(
    () => groups.filter((g) => groupMatchesFilter(g, memberPredicate)),
    [groups, memberPredicate],
  );
  const visibleSolo = useMemo(
    () => solo.filter((a) => memberPredicate(a)),
    [solo, memberPredicate],
  );

  // Bucket groups. Settled groups land in byTier keyed by the actual best
  // discount their members qualify for (date conditions and all). Incomplete
  // groups are further split by how many more members they need to reach the
  // lowest tier — so "just one away" surfaces separately from "needs many more".
  const { incompleteByNeed, byTier } = useMemo(() => {
    const incompleteByNeed = new Map<number, BuddyGroup[]>();
    const byTier = new Map<string, BuddyGroup[]>();
    const lowestMin = tiers[0]?.minSize ?? 2;
    for (const g of visibleGroups) {
      if (g.memberCount < lowestMin) {
        const need = lowestMin - g.memberCount;
        if (!incompleteByNeed.has(need)) incompleteByNeed.set(need, []);
        incompleteByNeed.get(need)!.push(g);
        continue;
      }
      // Use the actual computed discount for any active member to determine
      // which tier this group belongs to (respects date conditions).
      const firstMember = g.members[0];
      const actualDiscount = firstMember ? discountByAppId.get(firstMember.id) : null;
      const actualCode = actualDiscount?.best?.code;
      // Match to a tier by discount code, fall back to size-based assignment.
      let chosen = tiers.find((t) => t.key === actualCode)
        ?? tiers.reduce<Tier | null>((best, t) => (g.memberCount >= t.minSize ? t : best), null);
      if (chosen) {
        if (!byTier.has(chosen.key)) byTier.set(chosen.key, []);
        byTier.get(chosen.key)!.push(g);
      }
    }
    const sortByOldest = (a: BuddyGroup, b: BuddyGroup) =>
      (a.oldestSubmittedAt || "").localeCompare(b.oldestSubmittedAt || "");
    for (const list of incompleteByNeed.values()) {
      list.sort(sortByOldest);
    }
    for (const list of byTier.values()) {
      list.sort((a, b) => (b.memberCount - a.memberCount) || sortByOldest(a, b));
    }
    return { incompleteByNeed, byTier };
  }, [visibleGroups, tiers, discountByAppId]);

  // Sort needed-count buckets ascending — closest-to-unlock first.
  const incompleteBuckets = useMemo(
    () => [...incompleteByNeed.entries()].sort((a, b) => a[0] - b[0]),
    [incompleteByNeed],
  );
  const lowestTierLabel = tiers[0]?.label ?? "discount";

  const [soloExpanded, setSoloExpanded] = useState(false);

  if (visibleGroups.length === 0 && visibleSolo.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
        <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
        No buddy groups match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {incompleteBuckets.map(([need, groups]) => (
        <BoardSection
          key={`incomplete-${need}`}
          title={<>{need} more for <TierName>{lowestTierLabel}</TierName></>}
          count={groups.length}
          tone="amber"
        >
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              tiers={tiers}
              currentTier={null}
              onSelectApp={onSelectApp}
            />
          ))}
        </BoardSection>
      ))}

      {tiers.map((tier) => {
        const list = byTier.get(tier.key) ?? [];
        if (list.length === 0) return null;
        return (
          <BoardSection
            key={tier.key}
            title={<TierName>{tier.label}</TierName>}
            subtitle={
              tier.amount
                ? `${tier.minSize}+ members · −$${tier.amount}`
                : `${tier.minSize}+ members`
            }
            count={list.length}
            tone="green"
          >
            {list.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                tiers={tiers}
                currentTier={tier}
                onSelectApp={onSelectApp}
              />
            ))}
          </BoardSection>
        );
      })}

      {visibleSolo.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setSoloExpanded((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {soloExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Solo applicants ({visibleSolo.length})
          </button>
          {soloExpanded && (
            <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {visibleSolo.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelectApp(a)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <PrimaryBranchChip app={a} />
                    <span className="truncate font-medium text-foreground">{a.student_name}</span>
                    {a.grade && <span className="text-[10px] text-muted-foreground">{a.grade}</span>}
                  </div>
                  <StatusBadge status={a.application_status} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BoardSection({
  title,
  subtitle,
  count,
  tone,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  count: number;
  tone: "amber" | "green";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400",
        )}>
          {title}
        </span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
          tone === "amber"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        )}>
          {count}
        </span>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  tiers,
  currentTier,
  onSelectApp,
}: {
  group: BuddyGroup;
  tiers: Tier[];
  currentTier: Tier | null;
  onSelectApp: (app: SummerApplication) => void;
}) {
  const nextTier = currentTier
    ? tiers.find((t) => t.minSize > currentTier.minSize)
    : tiers[0];
  const needed = nextTier ? nextTier.minSize - group.memberCount : 0;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
        {group.code && <CodePill code={group.code} />}
        <span className="text-[11px] font-medium text-muted-foreground">
          {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
        </span>
        {group.crossBranch && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            Cross-branch
          </span>
        )}
        {nextTier && needed > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {needed} more for <TierName>{nextTier.label}</TierName>
          </span>
        )}
        {!nextTier && currentTier && (
          <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
            <Check className="h-3 w-3" /> Max tier
          </span>
        )}
      </div>
      <div className="divide-y divide-border/60">
        {group.members.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelectApp(a)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <PrimaryBranchChip app={a} />
              <span className="truncate text-sm font-medium text-foreground">{a.student_name}</span>
              {a.preferred_location && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {displayLocation(a.preferred_location)}
                </span>
              )}
            </div>
            <StatusBadge status={a.application_status} />
          </button>
        ))}
        {group.declaredSiblings
          .filter((s) => !group.members.some((m) => m.student_name === s.name_en || m.student_name === s.name_zh))
          .map((s) => (
            <div
              key={`sibling-${s.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-muted/20"
            >
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="shrink-0 text-[10px] font-semibold font-mono text-muted-foreground">
                  {s.source_branch}
                </span>
                <span className="truncate text-foreground">{s.name_en}</span>
                <SiblingBadge />
              </div>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                s.verification_status === "Confirmed"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
              )}>
                {s.verification_status}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// Config-driven tier name (e.g. "Early Bird Group of 3"). Italic + slightly
// darker serif-ish weight so it reads as a proper-noun product label rather
// than regular copy.
function TierName({ children }: { children: React.ReactNode }) {
  return (
    <span className="italic font-medium text-foreground/80 normal-case tracking-normal">
      {children}
    </span>
  );
}

function SiblingBadge() {
  return (
    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
      Sibling
    </span>
  );
}

function CodePill({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[11px] bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
      title="Copy buddy code"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {code}
    </button>
  );
}
