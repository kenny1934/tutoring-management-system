"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Database, LogOut, Megaphone, MessageSquarePlus, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SurfacePicker } from "@/components/ui/SurfacePicker";
import { RoleSwitcher } from "@/components/auth";
import { getInitials } from "@/lib/avatar-utils";
import { ADMIN_NAV, useNavigation, type NavItem } from "./useNavigation";
import { TAB_HREFS } from "./BottomTabBar";

const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink-subtle";
const ROW = "flex min-h-12 w-full items-center gap-3 px-4 text-[15px] font-medium text-foreground active:bg-wash";

/**
 * Everything on a phone that isn't one of the bottom bar's tabs: the other
 * pages, then the admin pages for those who have them, in the sidebar's order, and what the sidebar's
 * account menu holds on a wider screen. It opens from the bar's More tab as a
 * sheet, so it closes the way every sheet does: a pull down, a tap outside,
 * the close button or back.
 */
export function MoreSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, isSuperAdmin, effectiveRole, isImpersonating, impersonatedTutor, logout } = useAuth();
  const { selectedLocation, setSelectedLocation, locations } = useLocation();
  const { viewMode, setViewMode } = useRole();
  const { isAdminOrAbove, hasUnseenUpdates, mainNavigation, adminBadgeFor } = useNavigation();

  const displayName = impersonatedTutor?.name || user?.name || "Guest";
  const rawPicture = isImpersonating && impersonatedTutor?.profile_picture ? impersonatedTutor.profile_picture : user?.picture;
  const picture = rawPicture?.startsWith("http") ? rawPicture : undefined;
  const pages = mainNavigation.filter((item) => !TAB_HREFS.includes(item.href));

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-paper"
      header={(close) => (
        <div className="flex items-center gap-3 px-4 pb-3 border-b border-line">
          {picture ? (
            <Image src={picture} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {getInitials(displayName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
            <p className="text-sm text-ink-subtle">{effectiveRole || "Guest"}</p>
          </div>
          <RoleSwitcher />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-subtle active:bg-wash"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-5 px-4 pt-4 pb-4">
        {/* Whose lessons the app shows, and for admins which branch. */}
        <div className="flex gap-2">
          {isAdminOrAbove && (
            <label className="flex flex-1 flex-col gap-1">
              <span className={SECTION_LABEL}>Location</span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="h-11 rounded-lg border border-field bg-field-fill px-3 text-foreground"
                suppressHydrationWarning
              >
                {locations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-1 flex-col gap-1">
            <span className={SECTION_LABEL}>View</span>
            <div role="group" aria-label="Whose sessions to show" className="grid h-11 grid-cols-2 gap-1 rounded-lg bg-tint p-1">
              {([["center-view", "Center"], ["my-view", "Mine"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  className={cn(
                    "rounded-md text-sm font-medium transition-colors",
                    viewMode === mode ? "bg-field-fill text-foreground shadow-sm ring-1 ring-line-strong" : "text-ink-subtle",
                  )}
                  suppressHydrationWarning
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {pages.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className={SECTION_LABEL}>Pages</h3>
            <div className="grid grid-cols-4 gap-2">
              {pages.map((item) => (
                <Tile key={item.href} item={item} active={pathname?.startsWith(item.href)} onNavigate={onClose}>
                  {item.name === "Documents" && (
                    <span className="absolute right-1 top-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Beta
                    </span>
                  )}
                </Tile>
              ))}
            </div>
          </section>
        )}

        {isAdminOrAbove && (
          <section className="flex flex-col gap-2">
            <h3 className={SECTION_LABEL}>Admin</h3>
            <div className="grid grid-cols-4 gap-2">
              {ADMIN_NAV.map((item) => {
                const { count, color, showOpen } = adminBadgeFor(item.name);
                return (
                  <Tile key={item.href} item={item} active={pathname?.startsWith(item.href)} onNavigate={onClose}>
                    {showOpen && (
                      <span className="absolute right-1 top-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Open
                      </span>
                    )}
                    {(count ?? 0) > 0 && (
                      <span className={cn("absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold", color)}>
                        {count! > 99 ? "99+" : count}
                      </span>
                    )}
                  </Tile>
                );
              })}
              {isSuperAdmin && !isImpersonating && (
                <Tile item={{ name: "Debug", href: "/admin/debug", icon: Database }} active={pathname?.startsWith("/admin/debug")} onNavigate={onClose} />
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className={SECTION_LABEL}>Appearance</h3>
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-field-fill p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-medium text-foreground">Dark mode</span>
              <ThemeToggle compact />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium text-foreground">Background</span>
              <SurfacePicker />
            </div>
          </div>
        </section>

        <div className="overflow-hidden rounded-xl border border-line bg-field-fill divide-y divide-line">
          <Link href="/settings" onClick={onClose} className={ROW}>
            <Settings className="h-5 w-5 text-ink-subtle" />
            <span className="flex-1">Settings</span>
            <ChevronRight className="h-4 w-4 text-ink-subtle" />
          </Link>
          <Link href="/whats-new" onClick={onClose} className={ROW}>
            <Megaphone className="h-5 w-5 text-ink-subtle" />
            <span className="flex-1">What&apos;s new</span>
            {hasUnseenUpdates && <span aria-label="New" className="h-2 w-2 rounded-full bg-blue-500" />}
            <ChevronRight className="h-4 w-4 text-ink-subtle" />
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent("open-feedback"));
            }}
            className={ROW}
          >
            <MessageSquarePlus className="h-5 w-5 text-ink-subtle" />
            <span className="flex-1 text-left">Send feedback</span>
          </button>
          {user && (
            <button
              type="button"
              onClick={() => {
                onClose();
                logout();
              }}
              className={cn(ROW, "text-red-600 dark:text-red-400")}
            >
              <LogOut className="h-5 w-5" />
              <span className="flex-1 text-left">Sign out</span>
            </button>
          )}
        </div>

        {process.env.NEXT_PUBLIC_APP_VERSION && process.env.NEXT_PUBLIC_APP_VERSION !== "dev" && (
          <p className="text-center text-[11px] text-ink-subtle">{process.env.NEXT_PUBLIC_APP_VERSION}</p>
        )}
      </div>
    </MobileBottomSheet>
  );
}

// A page as a tile: big enough to hit with a thumb, and four to a row so the
// admin pages fit in two rows.
function Tile({
  item,
  active,
  onNavigate,
  children,
}: {
  item: Pick<NavItem, "name" | "href" | "icon">;
  active?: boolean;
  onNavigate: () => void;
  children?: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center text-[11px] font-semibold leading-tight transition-transform active:scale-[0.97]",
        active ? "border-primary bg-primary/10 text-accent-ink" : "border-line bg-field-fill text-foreground",
      )}
    >
      <Icon className={cn("h-5 w-5", active ? "text-accent-ink" : "text-ink-subtle")} />
      <span>{item.name}</span>
      {children}
    </Link>
  );
}
