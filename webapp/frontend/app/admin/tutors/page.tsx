"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { AdminPageGuard } from "@/components/auth/AdminPageGuard";
import { useTutors, usePageTitle } from "@/lib/hooks";
import { getInitials } from "@/lib/avatar-utils";
import { cn } from "@/lib/utils";
import { Users, Search, MapPin } from "lucide-react";
import type { Tutor, TutorRole } from "@/types";

// Roles that represent teaching/admin staff we surface on this page. Supervisor
// and Guest records stay editable only through the Super Admin debug panel.
const LISTED_ROLES: TutorRole[] = ["Tutor", "Admin", "Super Admin"];

const ROLE_BADGE: Record<string, string> = {
  "Super Admin": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Tutor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

// How tutors can be grouped into sections.
type GroupBy = "role" | "location" | "status";
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "location", label: "Location" },
  { value: "role", label: "Role" },
  { value: "status", label: "Status" },
];

// Seniority order + plural section labels for role grouping.
const ROLE_ORDER: Record<string, number> = { "Super Admin": 0, Admin: 1, Tutor: 2 };
const ROLE_GROUP_LABEL: Record<string, string> = {
  "Super Admin": "Super Admins",
  Admin: "Admins",
  Tutor: "Tutors",
};

const NO_LOCATION = "__none__";

function isActive(t: Tutor): boolean {
  return t.is_active_tutor !== false;
}

// Within a group: active tutors first, then alphabetical by name.
function sortTutors(list: Tutor[]): Tutor[] {
  return [...list].sort((a, b) => {
    if (isActive(a) !== isActive(b)) return isActive(a) ? -1 : 1;
    return a.tutor_name.localeCompare(b.tutor_name);
  });
}

interface TutorGroup {
  key: string;
  label: string;
  tutors: Tutor[];
}

function buildGroups(tutors: Tutor[], groupBy: GroupBy): TutorGroup[] {
  const map = new Map<string, Tutor[]>();
  for (const t of tutors) {
    const key =
      groupBy === "role"
        ? t.role
        : groupBy === "location"
        ? t.default_location || NO_LOCATION
        : isActive(t)
        ? "Active"
        : "Inactive";
    (map.get(key) ?? map.set(key, []).get(key)!).push(t);
  }

  const keys = [...map.keys()].sort((a, b) => {
    if (groupBy === "role") {
      return (ROLE_ORDER[a] ?? 99) - (ROLE_ORDER[b] ?? 99) || a.localeCompare(b);
    }
    if (groupBy === "location") {
      if (a === NO_LOCATION) return 1;
      if (b === NO_LOCATION) return -1;
      return a.localeCompare(b);
    }
    // status: Active before Inactive
    return a === "Active" ? -1 : 1;
  });

  return keys.map((key) => ({
    key,
    label:
      groupBy === "role"
        ? ROLE_GROUP_LABEL[key] ?? key
        : groupBy === "location"
        ? key === NO_LOCATION
          ? "No location"
          : key
        : key,
    tutors: sortTutors(map.get(key)!),
  }));
}

function rawPicture(t: Tutor): string | undefined {
  return t.profile_picture?.startsWith("http") ? t.profile_picture : undefined;
}

function TutorCard({ tutor, onOpen }: { tutor: Tutor; onOpen: () => void }) {
  const picture = rawPicture(tutor);
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group text-left flex items-center gap-4 p-4 rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#221c12] hover:shadow-md hover:border-[#d4a574] transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        !isActive(tutor) && "opacity-70"
      )}
    >
      {picture ? (
        <Image
          src={picture}
          alt={tutor.tutor_name}
          width={48}
          height={48}
          className="h-12 w-12 rounded-full object-cover shadow-sm flex-shrink-0"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
          <span className="text-sm font-bold text-primary-foreground">
            {getInitials(tutor.tutor_name)}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {tutor.tutor_name}
          </span>
          {tutor.is_active_tutor === false && (
            <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Inactive
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              ROLE_BADGE[tutor.role] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            )}
          >
            {tutor.role}
          </span>
          {tutor.nickname && (
            <span className="text-xs text-foreground/50 truncate">“{tutor.nickname}”</span>
          )}
        </div>
        {tutor.default_location && (
          <div className="mt-1 flex items-center gap-1 text-xs text-foreground/50">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{tutor.default_location}</span>
          </div>
        )}
      </div>
    </button>
  );
}

function TutorsPageInner() {
  usePageTitle("Tutors");
  const router = useRouter();
  const { data: tutors, isLoading } = useTutors();
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("location");

  const visibleTutors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tutors ?? [])
      .filter((t) => LISTED_ROLES.includes(t.role))
      .filter(
        (t) =>
          !q ||
          t.tutor_name.toLowerCase().includes(q) ||
          t.nickname?.toLowerCase().includes(q) ||
          t.default_location?.toLowerCase().includes(q)
      );
  }, [tutors, query]);

  const groups = useMemo(
    () => buildGroups(visibleTutors, groupBy),
    [visibleTutors, groupBy]
  );

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Users className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Tutors
                  {!isLoading && (
                    <span className="ml-2 text-base font-medium text-foreground/40">
                      {visibleTutors.length}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-foreground/60">
                  View profiles, schedules, and compensation
                </p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tutors…"
                className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm rounded-lg border border-foreground/15 bg-white dark:bg-[#231d14] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Group-by control */}
          <div className="mb-5 flex items-center gap-2">
            <span className="text-xs font-medium text-foreground/50">Group by</span>
            <div className="inline-flex rounded-lg border border-foreground/15 bg-white dark:bg-[#231d14] p-0.5">
              {GROUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setGroupBy(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    groupBy === opt.value
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "text-foreground/60 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Groups */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#221c12] animate-pulse"
                />
              ))}
            </div>
          ) : visibleTutors.length === 0 ? (
            <div className="text-center py-12 text-foreground/60">
              {query ? "No tutors match your search." : "No tutors found."}
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="mb-6 last:mb-0">
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground/50">
                  {group.label}
                  <span className="text-foreground/30">· {group.tutors.length}</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.tutors.map((tutor) => (
                    <TutorCard
                      key={tutor.id}
                      tutor={tutor}
                      onOpen={() => router.push(`/admin/tutors/${tutor.id}`)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PageTransition>
    </DeskSurface>
  );
}

export default function AdminTutorsPage() {
  return (
    <AdminPageGuard accessDeniedMessage="Admin access required to view tutors">
      <TutorsPageInner />
    </AdminPageGuard>
  );
}
