"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Users,
  ClipboardCheck,
  MessageSquare,
  Library,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  LogOut,
  Sparkles,
  X,
  Menu,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof Home;
  /** Accent dot color — drives the active-state indicator. */
  dot: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: Home, dot: "bg-mc-red-600" },
  { href: "/sessions", label: "Sessions", Icon: Calendar, dot: "bg-mc-red-600" },
  { href: "/students", label: "Students", Icon: Users, dot: "bg-ink-700" },
  { href: "/courseware", label: "Courseware", Icon: Library, dot: "bg-mc-peach-500" },
  { href: "/assessments", label: "Assessments", Icon: ClipboardCheck, dot: "bg-mc-peach-500" },
  { href: "/comms", label: "Parent Comms", Icon: MessageSquare, dot: "bg-ink-700" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile drawer on Esc.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Outside the flex row so the mobile header doesn't stack inside
       *  the sidebar column. */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-mc-line px-4 py-2">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-md text-ink-700 hover:bg-ink-100"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <BrandMark compact />
      </header>

      <div className="flex flex-1 min-h-0">
        {mobileOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-ink-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        <aside
          className={`
            fixed lg:sticky top-0 left-0 z-50 lg:z-auto
            h-screen bg-white border-r border-mc-line
            flex flex-col transition-[width,transform] duration-200 ease-out
            ${collapsed ? "w-[72px]" : "w-[240px]"}
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
            lg:translate-x-0
          `}
        >
          <div
            className={`flex items-center gap-2 py-3 border-b border-mc-line ${
              collapsed ? "px-2 justify-center" : "px-4 justify-between"
            }`}
          >
            {!collapsed && <BrandMark compact={false} />}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1 text-ink-500 hover:text-ink-800"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hidden lg:inline-flex p-1 text-ink-400 hover:text-ink-800 rounded-md hover:bg-ink-100"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <NavLinkRow
                  key={item.href}
                  item={item}
                  active={active}
                  collapsed={collapsed}
                />
              );
            })}
          </nav>

          <div className="border-t border-mc-line px-2 py-3">
            <UserFooter collapsed={collapsed} />
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">{children}</main>
          <footer className="border-t border-mc-line py-3 px-6 text-center text-[11px] text-ink-400">
            Prototype for internal discussion · Mock data only · No real
            student records
          </footer>
        </div>
      </div>
    </div>
  );
}

function BrandMark({ compact }: { compact: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 min-w-0">
      <div className="h-8 w-8 rounded-md bg-mc-red-600 text-white grid place-items-center text-sm font-bold shadow-sm shrink-0">
        I
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-900 leading-tight">
            IMMS Modules
          </div>
          <div className="text-[10px] uppercase tracking-wide text-ink-400 leading-tight">
            Prototype
          </div>
        </div>
      )}
    </Link>
  );
}

function NavLinkRow({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const { href, label, Icon, dot } = item;
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`
        relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
        ${
          active
            ? "bg-mc-red-50 text-mc-red-700 font-medium"
            : "text-ink-700 hover:bg-ink-100"
        }
        ${collapsed ? "justify-center" : ""}
      `}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-mc-red-600"
          aria-hidden
        />
      )}
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" />
        <span
          className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${dot} ${
            active ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? "Account" : undefined}
        className={`
          w-full flex items-center gap-3 px-2 py-1.5 rounded-md
          text-ink-700 hover:bg-ink-100 transition-colors
          ${collapsed ? "justify-center" : ""}
        `}
      >
        <div className="h-8 w-8 rounded-full bg-ink-200 text-ink-700 grid place-items-center text-xs font-semibold shrink-0">
          WW
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-ink-900 truncate">
              Ms Wendy Wong
            </div>
            <div className="text-[11px] text-ink-500 truncate">Primary tutor</div>
          </div>
        )}
        {!collapsed && <Settings className="h-4 w-4 text-ink-400 shrink-0" />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <UserPopover onClose={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}

function UserPopover({ onClose }: { onClose: () => void }) {
  const [location, setLocation] = useState("Causeway Bay");
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50 surface-mc p-3 space-y-3 shadow-lg">
      <div className="flex items-center gap-2 text-xs text-ink-500 uppercase tracking-wide">
        <MapPin className="h-3 w-3" />
        Location
      </div>
      <select
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="w-full text-sm rounded-md border border-mc-line px-2 py-1.5 bg-white"
      >
        <option>Causeway Bay</option>
        <option>Mong Kok</option>
        <option>Tsuen Wan</option>
      </select>
      <div className="border-t border-mc-line pt-2 space-y-0.5">
        <PopoverButton Icon={Sparkles} label="What's new" onClick={onClose} />
        <PopoverButton Icon={Settings} label="Settings" onClick={onClose} />
        <PopoverButton Icon={LogOut} label="Sign out" onClick={onClose} />
      </div>
      <div className="text-[10px] text-ink-400 text-center border-t border-mc-line pt-2">
        Prototype build · v0.1
      </div>
    </div>
  );
}

function PopoverButton({
  Icon,
  label,
  onClick,
}: {
  Icon: typeof Settings;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-700 hover:bg-ink-100 transition-colors"
    >
      <Icon className="h-4 w-4 text-ink-400" />
      {label}
    </button>
  );
}
