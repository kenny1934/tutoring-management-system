"use client";

import { Phone } from "lucide-react";
import { getBranchContact } from "@/lib/branch-contacts";
import { WeChatIcon } from "./contact-utils";

/**
 * Branch phone and WeChat, for a parent-facing screen whose copy asks the
 * reader to get in touch. Both intakes show this on the screen that stands in
 * for their application form out of season, so it lives here rather than in
 * either of their trees.
 *
 * The prop is structural rather than either config's `locations` type, so a
 * summer config, a regular config and a hardcoded fallback list all satisfy
 * it. Branches with no contact entry are dropped, which means a new branch
 * appears here the moment it has one.
 */
export function BranchContacts({
  locations,
  lang,
}: {
  locations: Array<{ name: string; name_en?: string }>;
  lang: "zh" | "en";
}) {
  const branches = locations.flatMap((loc) => {
    const contact = getBranchContact(loc.name);
    return contact ? [{ loc, contact }] : [];
  });
  if (branches.length === 0) return null;
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {branches.map(({ loc, contact }) => (
        <div
          key={loc.name}
          className="rounded-xl border border-border bg-card px-4 py-3 text-left"
        >
          <div className="text-sm font-semibold text-foreground">
            {lang === "zh" ? loc.name : loc.name_en || loc.name}
          </div>
          <div className="mt-1.5 flex items-center gap-4">
            <a
              href={`tel:${contact.phone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="tabular-nums tracking-wider">{contact.phone}</span>
            </a>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <WeChatIcon className="h-3.5 w-3.5 text-green-600" />
              <span className="tracking-wider">{contact.wechat}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
