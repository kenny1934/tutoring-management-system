"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Home, Inbox, LayoutGrid, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigation } from "./useNavigation";
import { scrollPageToTop } from "@/lib/scroll";

/** The pages the bar holds. The More sheet lists every other page. */
export const TAB_HREFS = ["/", "/students", "/sessions", "/inbox"];

// Sessions sits in the middle of the five, the easiest place for a thumb to
// reach with either hand, because it is what tutors open most. Home keeps the
// first place, where people expect it in every app.
const TABS: { name: string; href: string; icon: LucideIcon }[] = [
  { name: "Home", href: "/", icon: Home },
  { name: "Students", href: "/students", icon: Users },
  { name: "Sessions", href: "/sessions", icon: Calendar },
  { name: "Inbox", href: "/inbox", icon: Inbox },
];

function isOnTab(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The phone's main navigation: the four places a tutor goes most, in reach of
 * a thumb, and More for everything else. It is the same for every role, apart
 * from Inbox, which a Guest has no access to. The bar sits under the page,
 * not over it, and pads itself by the home bar's height, so nothing on the
 * page hides behind it.
 */
export function BottomTabBar({ moreOpen, onMore }: { moreOpen: boolean; onMore: () => void }) {
  const pathname = usePathname() ?? "/";
  const { hasInbox, unreadCount, hasUnseenUpdates } = useNavigation();
  const tabs = TABS.filter((tab) => hasInbox || tab.href !== "/inbox");
  const onSomeTab = tabs.some((tab) => isOnTab(pathname, tab.href));

  return (
    <nav
      aria-label="Main"
      className="grid shrink-0 border-t border-line bg-paper px-1 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.href}
          href={tab.href}
          label={tab.name}
          icon={tab.icon}
          active={isOnTab(pathname, tab.href)}
          atRoot={pathname === tab.href}
          badge={tab.href === "/inbox" && unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : undefined}
        />
      ))}
      <TabItem
        label="More"
        icon={LayoutGrid}
        // More is lit while its sheet is open, or while the page shown is one
        // of the pages it lists.
        active={moreOpen || !onSomeTab}
        dot={hasUnseenUpdates}
        expanded={moreOpen}
        onClick={onMore}
      />
    </nav>
  );
}

function TabItem({
  href,
  label,
  icon: Icon,
  active,
  atRoot,
  badge,
  dot,
  expanded,
  onClick,
}: {
  href?: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** On the tab's own page, so tapping it again goes back to the top. */
  atRoot?: boolean;
  badge?: string;
  dot?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
          active && "bg-primary/15",
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
        {badge && (
          <span className="absolute -top-1 left-[calc(50%+4px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-paper">
            {badge}
          </span>
        )}
        {dot && !badge && (
          <span aria-hidden="true" className="absolute top-0.5 left-[calc(50%+6px)] h-2 w-2 rounded-full bg-blue-500 ring-2 ring-paper" />
        )}
      </span>
      <span className={cn("text-[11px] leading-none", active ? "font-semibold" : "font-medium")}>{label}</span>
    </>
  );
  const className = cn(
    "flex h-[52px] flex-col items-center justify-center gap-1 transition-colors active:opacity-70",
    active ? "text-accent-ink" : "text-ink-subtle",
  );
  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={badge ? `${label}, ${badge} unread` : undefined}
        className={className}
        // Tapping the tab for the page you are on takes you back to its top,
        // as in a phone's own apps. From a page further in, such as one
        // student's page, it goes back to the tab's own page as usual.
        onClick={(e) => {
          if (atRoot && scrollPageToTop()) e.preventDefault();
        }}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-expanded={expanded} aria-label={dot ? `${label}, something new` : undefined} className={className}>
      {content}
    </button>
  );
}
