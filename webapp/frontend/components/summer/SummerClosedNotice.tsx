"use client";

import useSWR from "swr";
import { ArrowRight } from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import { type Lang, t, formatDate } from "@/lib/summer-utils";
import { REGULAR_APPLY_URL } from "@/lib/public-routes";
import { regularAPI } from "@/lib/api";
import { FALLBACK_BRANCHES } from "@/lib/branch-contacts";
import { BranchContacts } from "@/components/parent-contacts";

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
export function SummerClosedNotice({
  config,
  lang,
}: {
  config?: SummerCourseFormConfig | null;
  lang: Lang;
}) {
  // A parent who has just missed summer is usually still looking for a class,
  // and between early August and the end of September the September intake is
  // the answer. Regular's own config is the only thing that knows whether it
  // is taking applications, so ask it rather than having summer's endpoint
  // carry a second-hand copy of the answer. The SWR key is shared with the
  // admin sidebar badge. A failure here needs no handling: the branch contacts
  // below are the fallback.
  const { data: regular } = useSWR(
    "regular-public-config",
    () => regularAPI.getFormConfig(),
    { revalidateOnFocus: false },
  );
  const regularOpen = regular?.application_window === "open";

  // Without a config there is no intake running, which reads to a parent as
  // the same thing as a season that has ended.
  const notYetOpen = config?.application_window === "before";

  return (
    <div className="text-center py-20">
      <h2 className="text-xl font-semibold text-foreground">
        {notYetOpen
          ? t("暑期課程報名尚未開放", "Summer course registration is not yet open", lang)
          : t("暑期課程報名期已結束", "The summer application period has ended", lang)}
      </h2>

      {/* Before the window opens we can say exactly when it does, which is
          more use to a parent than "check back later". */}
      {notYetOpen && config && (
        <p className="mt-2 text-muted-foreground">
          {t(
            `報名將於${formatDate(config.application_open_date, "zh")}開放。`,
            `Applications open on ${formatDate(config.application_open_date, "en")}.`,
            lang,
          )}
        </p>
      )}

      {regularOpen && regular ? (
        <div className="mt-6">
          <p className="text-muted-foreground">
            {t(
              `常規課程現正接受報名，報名期至${formatDate(regular.application_close_date, "zh")}。`,
              `The regular course is taking applications until ${formatDate(regular.application_close_date, "en")}.`,
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
          <BranchContacts
            locations={config?.locations ?? FALLBACK_BRANCHES}
            lang={lang}
          />
        </>
      )}
    </div>
  );
}
