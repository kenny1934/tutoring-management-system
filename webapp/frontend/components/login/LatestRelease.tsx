/**
 * One line under the sign-in button about the newest release, so a tutor
 * hears about a change before they run into it in the middle of a lesson.
 * It's read from the changelog the What's new page shows, so it's always the
 * release that's live, and it names the release's first two changes by their
 * headings, the bold words each changelog entry opens with.
 */
import changelogData from "@/lib/changelog-data";

/** An entry's heading, such as "A calmer look", from its "**A calmer look**: …" description. */
function heading(description: string): string | null {
  const match = /^\*\*(.+?)\*\*/.exec(description);
  return match ? match[1] : null;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** What this line reads of a release. The changelog's own type is every entry spelt out word for word. */
interface Release {
  version: string;
  sections: readonly { items: readonly { description: string }[] }[];
}

export function LatestRelease() {
  const latest = (changelogData as readonly Release[])[0];
  if (!latest) return null;
  const headings = latest.sections
    .flatMap((section) => section.items)
    .map((item) => heading(item.description))
    .filter((text): text is string => text !== null);
  if (headings.length === 0) return null;
  const named = headings.slice(0, 2).map(lowerFirst);
  const others = headings.length - named.length;
  const list = others > 0
    ? `${named.join(", ")}, and ${others} more ${others === 1 ? "change" : "changes"}`
    : named.join(" and ");
  return (
    <p className="m-0 text-[13px] leading-relaxed text-ink-subtle">
      <span className="font-semibold text-gray-900 dark:text-gray-100">New in {latest.version}: </span>
      {list}.
    </p>
  );
}
