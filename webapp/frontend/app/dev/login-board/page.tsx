/**
 * A preview of the sign-in board, for development only. It isn't the sign-in
 * page, and nothing links to it.
 *
 * - The plain address shows the sign-in page as staff see it, with today's
 *   problem on the board. Add ?problem=<id> to put a particular problem up,
 *   and ?error=<code>, such as ?error=unauthorized, to see how a failed
 *   sign-in reads. The button does nothing here.
 * - ?sheet=1 shows every problem at once, finished, with its name, so a
 *   person can read through the whole set before it goes live.
 *
 * On a development server it opens without signing in and without the app's
 * frame, as the login page does, and anywhere else it doesn't exist.
 */
import { notFound } from "next/navigation";
import { LoginBoard } from "@/components/login/LoginBoard";
import { SignInPage } from "@/components/login/SignInPage";
import { BOARD_PROBLEMS } from "@/lib/login-board/problems";

interface PreviewProps {
  searchParams: Promise<{ sheet?: string; problem?: string; error?: string }>;
}

export default async function LoginBoardPreview({ searchParams }: PreviewProps) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { sheet, problem, error } = await searchParams;
  return sheet ? <ContactSheet /> : <SignInPage problemId={problem} error={error} />;
}

function ContactSheet() {
  return (
    <div className="fixed inset-0 z-[60] overflow-auto bg-canvas px-4 py-6 text-gray-900 dark:text-gray-100 sm:px-8">
      <header className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-3">
        <h1 className="m-0 text-lg font-semibold">The sign-in board&apos;s problems</h1>
        <p className="m-0 text-[13px] text-ink-subtle">
          All {BOARD_PROBLEMS.length} of them, finished, in the order the days go through them. Every line is checked by the tests, so this is for the wording and the notation.
        </p>
      </header>
      <ol className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 2xl:grid-cols-3">
        {BOARD_PROBLEMS.map((p, i) => (
          <li key={p.id} className="flex min-w-0 flex-col gap-1.5">
            <p className="m-0 text-xs text-ink-subtle">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{i + 1}.</span> <code>{p.id}</code>
            </p>
            <LoginBoard problemId={p.id} still className="h-72" />
          </li>
        ))}
      </ol>
    </div>
  );
}
