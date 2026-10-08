/**
 * The CSM Pro logo, drawn inline so it follows light and dark mode.
 *
 * There are three versions, all cut from the one drawing in scripts/logo:
 *
 * - "full" is the logo with PRO between the M's legs. PRO is readable from
 *   about 150 pixels wide, so use it where the logo has that much room.
 * - "no-pro" leaves PRO out, for narrower places such as the phone header.
 * - "c" is the C and its arrow on their own, for a square space.
 *
 * Its size comes from the className, usually a height with the width left to
 * follow. The browser-tab and phone icons are separate files in public/brand
 * and app/, written by the same script. The sidebar's own logo, which turns
 * from the C into the whole logo, is SidebarLogo.
 */
import { useId } from "react";
import { cn } from "@/lib/utils";
import { LOGO_C_PIECES, LOGO_C_VIEW, LOGO_PIECES, LOGO_PRO, LOGO_VIEW, type LogoPiece } from "./logo-art";

const INK = "fill-[#1f1a14] dark:fill-[#f3ede4]";
const OAK = "fill-accent-ink";

/**
 * The paths of the logo's pieces, in drawing order, for inside an <svg>.
 * `id` keeps the S's twist's clip and mask apart from any other logo on the page.
 */
export function LogoPaths({ pieces, id, pro = false }: { pieces: LogoPiece[]; id: string; pro?: boolean }) {
  const twist = pieces.find((p): p is Extract<LogoPiece, { tone: "twist" }> => p.tone === "twist");
  return (
    <>
      {twist && (
        <defs>
          <clipPath id={`${id}-twist`}>
            <circle cx={twist.circle[0]} cy={twist.circle[1]} r={twist.circle[2]} />
          </clipPath>
          {/* The oak under the twist is cut away, all but a sliver along its curved edge, so no oak shows through the ink's soft edges as a hairline. */}
          <mask id={`${id}-under`} maskUnits="userSpaceOnUse" x={0} y={0} width={480} height={480}>
            <rect width={480} height={480} fill="#fff" />
            <circle cx={twist.circle[0]} cy={twist.circle[1]} r={twist.circle[2] - 1} fill="#000" />
          </mask>
        </defs>
      )}
      {pieces.map((piece, i) => {
        if (piece.tone === "twist") return <path key={i} d={piece.d} className={INK} clipPath={`url(#${id}-twist)`} />;
        // The S is the piece drawn just before the twist.
        const underTwist = pieces[i + 1]?.tone === "twist";
        return (
          <path key={i} d={piece.d} className={piece.tone === "ink" ? INK : OAK} mask={underTwist ? `url(#${id}-under)` : undefined} />
        );
      })}
      {pro && <path d={LOGO_PRO} className={OAK} />}
    </>
  );
}

interface LogoProps {
  variant?: "full" | "no-pro" | "c";
  className?: string;
  /** What a screen reader says. Pass an empty string where the name is already written next to it. */
  label?: string;
}

export function Logo({ variant = "full", className, label = "CSM Pro" }: LogoProps) {
  // The twist's clip and mask need ids of their own, because the sidebar and the phone header can both be on the page.
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox={variant === "c" ? LOGO_C_VIEW : LOGO_VIEW}
      className={cn("shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <LogoPaths pieces={variant === "c" ? LOGO_C_PIECES : LOGO_PIECES} id={id} pro={variant === "full"} />
    </svg>
  );
}
