/**
 * Tables for CSM's staff pages: a tinted 32px header in 11px capitals, then
 * 36px rows divided by thin lines. Numbers sit to the right in figures of
 * equal width, so a column of them lines up. The table scrolls sideways inside
 * its own frame on a narrow screen, so the page itself never does.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-field-fill">
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

type CellProps = { numeric?: boolean };

export function Th({ numeric, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 whitespace-nowrap bg-tint px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ numeric, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cn("h-9 border-t border-line px-3", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-tint/50", className)} {...props} />;
}
