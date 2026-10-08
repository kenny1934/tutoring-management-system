"use client";

/**
 * The sign-in page as staff see it: today's date and a worked problem on the
 * board down the left, and the sign-in itself on the right. On a phone the
 * two stack, with the board kept to about a third of the screen's height so
 * the sign-in button stays in view.
 *
 * The login page passes in what to do when the button is pressed, and the
 * error Google sent back, if any. The development preview of the board shows
 * the same page with a particular problem up and no sign-in behind the button.
 */
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { LOGO_TAGLINE } from "@/components/brand/logo-art";
import { AlertCircle } from "lucide-react";
import { GoogleIcon } from "@/components/login/GoogleIcon";
import { LatestRelease } from "@/components/login/LatestRelease";
import { LoginBoard } from "@/components/login/LoginBoard";
import { regularAPI } from "@/lib/api";
import { boardDate, schoolWeek } from "@/lib/login-board/today";

/**
 * What each error the sign-in can come back with means to the person reading
 * it. A closed account is told apart from one that was never set up on
 * purpose, so somebody who has left isn't left wondering whether something is
 * broken.
 */
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "This Google account isn't authorised to use CSM Pro. Please contact an administrator.",
  account_closed: "This account was closed when your employment ended. Please contact an administrator if you think that's wrong.",
  no_email: "We couldn't get your email address from Google. Please try again.",
  oauth_failed: "Signing in with Google didn't work. Please try again.",
};
const FALLBACK_ERROR = "Something went wrong while signing you in. Please try again.";

/** The sentence for an error code from the sign-in, or null when there's no error. */
export function signInError(code: string | null | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? FALLBACK_ERROR;
}

/**
 * Which week of the school year it is, counted from the start of the regular
 * course that's currently set up. It's null until that's known, and stays
 * null when there's no course set up, when the course started more than a
 * year ago, or when the request fails, so the page simply goes without it.
 */
function useSchoolWeek(): number | null {
  const [week, setWeek] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    regularAPI
      .getFormConfig()
      .then((config) => {
        if (live) setWeek(schoolWeek(config.course_start_date));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return week;
}

interface SignInPageProps {
  /** What the sign-in button does. */
  onSignIn?: () => void;
  /** The error code the sign-in came back with, such as "unauthorized". */
  error?: string | null;
  /** The problem to put on the board, by its id, for the preview. Without it, the board shows today's problem. */
  problemId?: string;
}

export function SignInPage({ onSignIn, error, problemId }: SignInPageProps) {
  const week = useSchoolWeek();
  const errorMessage = signInError(error);
  const year = new Date().getFullYear();
  return (
    <div className="fixed inset-0 z-[60] overflow-auto bg-canvas text-gray-900 dark:text-gray-100">
      {/* Stacked, the sign-in panel takes whatever height is left, so no gap opens under the board. */}
      <div className="grid min-h-full grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1.45fr)_minmax(24rem,1fr)] lg:grid-rows-none">
        <section className="flex min-w-0 flex-col gap-5 px-4 pb-6 pt-5 sm:px-8 sm:pt-7 lg:px-12 lg:pb-8 lg:pt-9">
          {/* The tagline spells out what CSM Pro stands for, the first place most people meet the name. */}
          <div className="flex flex-col gap-1.5 self-start">
            <Logo className="h-12 w-auto self-start sm:h-14" />
            <p className="m-0 text-balance text-[11px] text-ink-subtle sm:text-[13px]">{LOGO_TAGLINE}</p>
          </div>
          {/* The date and the board sit in the middle of the column, whatever size the board is that day. */}
          <div className="flex w-full max-w-[56rem] flex-col gap-5 lg:my-auto">
            <div>
              <p className="m-0 text-2xl font-semibold tracking-tight sm:text-[2rem] sm:leading-tight">{boardDate()}</p>
              {/* The line's height is kept whether or not the week is known, so the board doesn't move down when it arrives. */}
              <p className="m-0 mt-1 min-h-5 text-sm text-ink-subtle">{week !== null && `Week ${week} of the school year`}</p>
            </div>
            {/* Stacked in one column, the board is kept to about a third of the screen's height, so the sign-in button stays in view. */}
            <LoginBoard problemId={problemId} fit paperClassName="max-h-[32dvh] lg:max-h-none" />
          </div>
          <p className="m-0 hidden text-xs text-ink-subtle lg:block">© {year} CSM Pro</p>
        </section>

        <main className="flex items-center justify-center border-t border-line bg-paper px-4 py-7 sm:px-8 lg:border-l lg:border-t-0 lg:py-10">
          <div className="flex w-full max-w-sm flex-col gap-5">
            <div>
              <h1 className="m-0 text-xl font-semibold">Sign in</h1>
              <p className="m-0 mt-1 text-sm text-ink-subtle">Use your work Google account.</p>
            </div>
            {errorMessage && (
              <div role="alert" className="flex items-start gap-2.5 rounded border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onSignIn}
              className="flex h-11 w-full items-center justify-center gap-3 rounded border border-field bg-field-fill text-sm font-semibold text-gray-900 transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 dark:text-gray-100"
            >
              <GoogleIcon className="h-[18px] w-[18px]" />
              Sign in with Google
            </button>
            <p className="m-0 text-[13px] leading-relaxed text-ink-subtle">
              Only staff with a CSM account can sign in. If you need one, ask an administrator.
            </p>
            <div className="border-t border-line pt-4">
              <LatestRelease />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
