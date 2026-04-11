import { getUrlBadge } from "@/lib/exercise-utils";

/** Renders a small colored badge for URL exercise type (Slides, Video, Math, Quiz, Link, etc.) */
export function UrlBadge({ url }: { url?: string | null }) {
  const badge = getUrlBadge(url);
  if (!badge) return null;
  return (
    <span className={`ml-1 text-[9px] px-1 rounded ${badge.className}`}>
      {badge.label}
    </span>
  );
}

/** Inline-style version for contexts that don't use Tailwind (e.g., Zen mode) */
export function UrlBadgeInline({ url }: { url?: string | null }) {
  const badge = getUrlBadge(url);
  if (!badge) return null;
  return (
    <span style={{ fontSize: '9px', padding: '0 3px', borderRadius: '3px', backgroundColor: `${badge.hex}20`, color: badge.hex, flexShrink: 0 }}>
      {badge.label}
    </span>
  );
}
