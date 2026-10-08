/**
 * The logo at the top of the desktop sidebar. Collapsed, the sidebar shows
 * the C and its arrow. Opening, the rest of the logo is drawn out of the C the
 * way the logo is built: the ribbon runs from the C's foot along the
 * baseline, round the S and into the M's \, and the M's other pieces settle
 * in as it reaches them, PRO last. Closing winds it back into the C.
 *
 * The whole logo is drawn throughout and seen through a mask. The mask starts
 * as exactly the C on its own, so the collapsed sidebar and the first frame
 * of the opening are the same picture. A stroke along the ribbon's centre line
 * then uncovers the rest. The timings are in globals.css, under "The sidebar
 * logo".
 *
 * Opening takes longer than the sidebar does, about 550ms against its 350ms.
 * The sidebar is nearly open in its first 120ms, so the ribbon is drawn in
 * plain view. Closing is quicker than the sidebar, so the ribbon is back in
 * the C before the sidebar's edge covers it. Anyone who has asked their
 * device for less motion sees the rest of the logo fade in and out instead.
 */
import { useId } from "react";
import { LogoPaths } from "./Logo";
import { LOGO_C_PIECES, LOGO_M, LOGO_PIECES, LOGO_PRO, LOGO_RIBBON, LOGO_VIEW } from "./logo-art";

/**
 * The M's pieces and PRO in the mask, in the order they come in, with when
 * each arrives as a share of the opening and when each leaves as a share of
 * the closing. Closing, they leave first, in the reverse order.
 */
const PIECES = [
  { d: LOGO_M.leftLeg, arrives: 0.45, leaves: 0.15 },
  { d: LOGO_M.fore, arrives: 0.6, leaves: 0.1 },
  { d: LOGO_M.rightLeg, arrives: 0.68, leaves: 0.05 },
  { d: LOGO_PRO, arrives: 0.76, leaves: 0 },
  // The \ is mostly drawn by the ribbon already. This fills the corner of its slanted end that the ribbon's flat end misses.
  { d: LOGO_M.back, arrives: 0.8, leaves: 0.15 },
];

interface SidebarLogoProps {
  open: boolean;
  /** Whether to animate the change. Off until the person first opens or closes the sidebar, so a sidebar restored as collapsed starts that way. */
  animate: boolean;
}

export function SidebarLogo({ open, animate }: SidebarLogoProps) {
  const id = useId().replace(/:/g, "");
  return (
    <span
      className="sidebar-logo relative block h-10 w-[99px] shrink-0"
      data-open={open || undefined}
      data-animate={animate || undefined}
    >
      <svg viewBox={LOGO_VIEW} className="absolute left-0 top-0 h-10 w-auto overflow-visible" aria-hidden="true">
        <defs>
          <mask id={`${id}-reveal`} maskUnits="userSpaceOnUse" x={0} y={100} width={480} height={300}>
            {LOGO_C_PIECES.map((piece, i) => (
              <path key={i} d={piece.d} fill="#fff" />
            ))}
            <path
              d={LOGO_RIBBON}
              className="sidebar-logo-ribbon"
              pathLength={1}
              fill="none"
              stroke="#fff"
              strokeWidth={40}
              strokeLinejoin="round"
            />
            {PIECES.map((piece, i) => (
              <path
                key={i}
                d={piece.d}
                fill="#fff"
                className="sidebar-logo-piece"
                style={{ "--arrives": piece.arrives, "--leaves": piece.leaves } as React.CSSProperties}
              />
            ))}
          </mask>
        </defs>
        {/* The C on its own, under the whole logo. Only the fade for less motion needs it. */}
        <g className="sidebar-logo-c">
          <LogoPaths pieces={LOGO_C_PIECES} id={`${id}-c`} />
        </g>
        <g className="sidebar-logo-whole" mask={`url(#${id}-reveal)`}>
          <LogoPaths pieces={LOGO_PIECES} id={`${id}-whole`} pro />
        </g>
      </svg>
    </span>
  );
}
