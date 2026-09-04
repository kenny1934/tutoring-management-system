"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Phone } from "lucide-react";
import type { SummerCourseFormConfig, SummerRegularIntakeHint } from "@/types";
import { type Lang, t, formatDate } from "@/lib/summer-utils";
import { REGULAR_APPLY_URL } from "@/lib/regular-utils";
import { regularAPI } from "@/lib/api";
import { getBranchContact, FALLBACK_BRANCHES } from "@/lib/branch-contacts";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";

/**
 * What every parent-facing summer page shows when the application window is
 * shut. The landing page, the form and the status check all render this in
 * place of their own content, so a parent who arrives out of season sees one
 * consistent answer wherever their link happened to point.
 *
 * It deliberately offers no link to the status page. Outside the window the
 * status check is closed too, so a link there would only lead to this same
 * notice a second time.
 *
 * `config` is optional because the pages also render this when the public
 * config 404s, meaning no summer intake is active at all. That is the gap
 * between one year's config being deactivated and the next being activated,
 * and the pages used to fail into a raw error there.
 */

/** Branch phone and WeChat, shown when we have nothing better to offer than a
 *  conversation. Branches come from the config, so a new one appears here as
 *  soon as it has a contact entry. */
function BranchContacts({
  locations,
  lang,
}: {
  locations: Array<{ name: string; name_en?: string }>;
  lang: Lang;
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

export function SummerClosedNotice({
  config,
  lang,
}: {
  config?: SummerCourseFormConfig | null;
  lang: Lang;
}) {
  // No config means no intake is running, which reads to a parent as the same
  // thing as a season that has ended.
  const applicationWindow = config?.application_window ?? "closed";
  const closed = applicationWindow !== "before";

  // With no config we cannot learn from it whether the September intake is
  // running, and the gap is most likely to open in the autumn, which is
  // exactly when regular is taking applications. So on that path only, ask
  // regular directly rather than dropping the parent at a list of phone
  // numbers. A failure here is not worth surfacing: the contacts still show.
  const [fallbackIntake, setFallbackIntake] =
    useState<SummerRegularIntakeHint | null>(null);
  useEffect(() => {
    if (config) return;
    let cancelled = false;
    regularAPI
      .getFormConfig()
      .then((cfg) => {
        if (cancelled || cfg.application_window !== "open") return;
        setFallbackIntake({
          year: cfg.year,
          application_close_date: cfg.application_close_date,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config]);

  const regular = config?.regular_intake ?? fallbackIntake;
  const locations = config?.locations ?? FALLBACK_BRANCHES;

  const heading = closed
    ? t("暑期課程報名期已結束", "The summer application period has ended", lang)
    : t("暑期課程報名尚未開放", "Summer course registration is not yet open", lang);

  // Before the window opens we can say exactly when it does, which is more use
  // to a parent than "check back later".
  const body =
    closed || !config
      ? null
      : t(
          `報名將於${formatDate(config.application_open_date.slice(0, 10), lang)}開放。`,
          `Applications open on ${formatDate(config.application_open_date.slice(0, 10), "en")}.`,
          lang,
        );

  return (
    <div className="text-center py-20">
      <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
      {body && <p className="mt-2 text-muted-foreground">{body}</p>}

      {regular ? (
        // A parent who has just missed summer is usually still looking for a
        // class, and between early August and the end of September the
        // September intake is the answer.
        <div className="mt-6">
          <p className="text-muted-foreground">
            {t(
              `常規課程現正接受報名，報名期至${formatDate(regular.application_close_date.slice(0, 10), lang)}。`,
              `The regular course is taking applications until ${formatDate(regular.application_close_date.slice(0, 10), "en")}.`,
              lang,
            )}
          </p>
          <a
            href={REGULAR_APPLY_URL}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            {t(
              `前往${regular.year}年常規課程報名`,
              `Go to the ${regular.year} regular application form`,
              lang,
            )}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            {t(
              "如有查詢，歡迎聯絡分校。",
              "Please contact a branch if you have any questions.",
              lang,
            )}
          </p>
          <BranchContacts locations={locations} lang={lang} />
        </>
      )}
    </div>
  );
}
