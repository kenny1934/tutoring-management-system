/**
 * The header at the top of a staff page: an icon, the page's name and a short
 * line about it, all on one row, with the page's own buttons on the right and
 * a hairline underneath. Kenny chose this "Ledger line" on 2026-10-07 over a
 * stacked title and a boxed toolbar, because most of these pages are lists and
 * this gives the list the most room.
 *
 * The icon is grey on purpose. Pages used to put it in a tile of their own
 * colour, which said nothing, so every page now looks the same here.
 *
 * On a phone the short line is hidden and the buttons drop to their own row,
 * so the name is never cut short.
 *
 * Pages whose header is also their toolbar (Sessions, Courseware) pass their
 * controls as `children`, which sit on the same row straight after the name.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: React.ReactNode;
  icon?: LucideIcon;
  /** One short line about the page, shown after the name on wider screens. */
  subtitle?: React.ReactNode;
  /** Shown right after the name, such as a count or a link to open a form. */
  titleExtra?: React.ReactNode;
  /** For a page reached from another page rather than the sidebar. */
  backHref?: string;
  backLabel?: string;
  /** The page's own buttons, on the right. */
  actions?: React.ReactNode;
  /** Toolbar controls that sit on the same row, straight after the name. */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  icon: Icon,
  subtitle,
  titleExtra,
  backHref,
  backLabel = "Back",
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-3", className)}>
      <div className="flex min-w-[10rem] flex-1 flex-wrap items-center gap-x-2.5 gap-y-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="-ml-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-tint hover:text-gray-900 dark:hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        {Icon && <Icon className="h-[18px] w-[18px] flex-shrink-0 text-ink-subtle" aria-hidden="true" />}
        <h1 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold leading-tight text-gray-900 dark:text-gray-100">
          <span className="truncate">{title}</span>
          {titleExtra}
        </h1>
        {subtitle && (
          <p className="hidden min-w-0 truncate text-[13px] text-ink-subtle sm:block">
            <span aria-hidden="true" className="mr-2">·</span>
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
