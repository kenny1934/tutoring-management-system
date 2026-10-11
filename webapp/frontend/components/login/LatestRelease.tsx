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

/**
 * A heading as it reads in the middle of the sentence: "A bar along the
 * bottom" becomes "a bar along the bottom". A heading that opens with a name
 * keeps its capitals, because lowering them turned "CSM as an app" into
 * "cSM as an app". A name is a first word with a capital inside it (CSM,
 * WhatsApp, PDF), or two capitalised words in a row ("Vasco Center").
 */
export function lowerFirst(text: string): string {
  const [first = "", second = ""] = text.split(" ");
  const isName = /[A-Z]/.test(first.slice(1)) || /^[A-Z]/.test(second);
  return isName ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

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
