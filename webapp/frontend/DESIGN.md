# CSM Design

This is how CSM's staff pages look and why, as rebuilt in October 2026. If you're about to add a colour, a radius, a shadow or a status style, read the section it belongs to first, because most of these are set in one place and the rest of the app follows.

## The direction

CSM is a working tool for tutors and admins, so it should feel calm and clear before it feels anything else. It keeps the warm oak palette it has always had, in light and dark, and it takes its structure from Ledger, the house style of the supply order app and the message template library: few borders, thin rules, little shadow, and colour that means something.

The earlier design (dark glass, gradients, a wooden desk behind every page, handwriting fonts, bouncy springs) made the app feel like a classroom toy and was hard to change, because most colours were written as hex codes in hundreds of files. The work in October 2026 moved those colours onto named tokens, quietened the surfaces, and fixed contrast across the app.

Three places keep more character on purpose. **Lesson mode** keeps its board tools and springs, because tutors project it in front of children. **The session detail page** keeps its chalkboard header. **The public summer and regular intake pages** are not part of CSM and keep their own look entirely (see "The public pages" below).

## The rules, by name

These are the rules people refer to when reviewing a screen. Each has its reasoning, so you can tell when an exception is fair.

- **Colour means status.** Colour should tell the reader how something stands: done, waiting, wrong. A page section or a navigation item doesn't get its own colour just to look lively. When everything is coloured, nothing stands out.
- **One accent per screen.** The oak accent marks the action the person came to take, and the current place in the navigation. If three buttons on a screen are oak, two of them should be plain.
- **Large areas soft, small marks solid.** A big block of colour, like the status strip on a session card, uses a pale fill with a dark icon, because a bright block that size shouts. A small mark, like an icon-only status badge, uses a solid fill with a white icon, because a pale fill that small can't be told apart from its neighbours.
- **Keep the icon.** Tutors scan a day's sessions by status. The status icon (clock, tick, pencil, flask) is what they pick out first, so a status always shows its icon, even where the style is otherwise quiet.
- **Rules before shadows.** Separate things with a thin line or a little space before reaching for a shadow. Shadows are for things that actually float: menus, popovers, modals, toasts.
- **Readable means 4.5:1.** Text needs a contrast of at least 4.5:1 against what's behind it. Icons that carry meaning, and the edge of a text field, need 3:1. These are the WCAG AA thresholds, and every token below was chosen against them.

## Colour tokens

All colours live in `app/globals.css`. The `@theme` block holds the light values, and the `.dark` block holds the dark ones. Each token is named for the job it does, never for the colour it happens to be. So `border-line` is right in any theme, while a name like `border-oak` would be wrong the day a deployment picks a different palette.

Use these in place of hex codes. If you find yourself writing `border-[#e8d4b8] dark:border-[#6b5a4a]`, the token for it is `border-line`.

| Token | Light | Dark | Use it for |
|---|---|---|---|
| `primary` | `#8f6240` | `#8f6240` | Fills: the main button, the active marker, a focus ring. White text on it scores 5.3:1. |
| `primary-hover` | `#7a5336` | `#7a5336` | The main button under the pointer. It goes darker, never lighter, so the text keeps its contrast. |
| `accent-ink` | `#8f6240` | `#cd853f` | The accent as text: links, highlighted labels. It's lighter in dark mode, where the fill colour would be too dark to read. |
| `accent-ink-hover` | `#7a5336` | `#dda15e` | Accent text under the pointer. |
| `ink-strong` | `#5a3d1f` | `#d4a574` | Deep heading text in the oak family. |
| `ink-subtle` | `#7d674c` | `#a09080` | Secondary text: captions, meta, quiet labels. 5.1:1 on cream. |
| `line` | `#e8d4b8` | `#6b5a4a` | Ordinary borders and dividers. Decorative, so it doesn't need 3:1. |
| `line-strong` | `#d4a574` | `#8b6f47` | A border that needs to stand out from `line`. |
| `field` | `#9c876f` | `#857160` | The edge of a text field, select or textarea. It clears 3:1 in both modes, because a field you can't see the edge of is hard to find. |
| `paper` | `#fef9f3` | `#2d2618` | The cream surface cards and panels sit on. |
| `tint` | `#f5ede3` | `#3d3628` | Tinted panels, table headers, hover fills. |
| `canvas` | `#f5efe6` | `#13110e` | The plain page background, one step darker than paper so cards stand out. |
| `on-surface` | (follows the background) | white | Text drawn straight onto the page background, like a page heading. It is dark ink on the plain background and white on the wood desk. |

Fills and text are separate on purpose. A single oak used for both can't work in dark mode: a fill dark enough to carry white text is too dark to read as text on a dark card. So fills use `primary` and text uses `accent-ink`. In particular, don't use `text-primary`. Use `text-accent-ink`.

The older tokens from before October 2026 (`foreground`, `muted-foreground`, `card`, `border`, `background` and the rest) still exist and are fine to use. Their dark values don't always match the oak palette, so prefer the role tokens above for anything oak-coloured.

## Status colours

Statuses get their colour from two places.

**`lib/tones.ts`** holds five tones: neutral, info, success, warning and danger. Each has a `soft` chip (a pale fill with dark text and an inset ring, which takes no space), a `solid` fill with white text for small count badges, and a `text` colour. Use these for anything that tells the reader how things stand, such as the sidebar's count badges, instead of picking a Tailwind colour on the spot. Red only ever means something has gone wrong.

**`lib/session-status.ts`** gives each session status its own hue, because people read the sessions page by those hues. `getSessionStatusConfig(status)` returns a class for each way a status is drawn:

| Field | What it draws |
|---|---|
| `textClass` | The status word, coloured. It passes 4.5:1 on white. |
| `stripClass` and `stripIconClass` | The strip on the right of a session card: a pale fill with a dark icon (large areas soft). |
| `badgeClass` | An icon-only badge: a solid fill with a white icon (small marks solid). Every icon on it clears 3:1. |
| `bgClass` and `iconClass` | The older solid fill and its icon accents, still used by thin strips with no icon, dots, the status filter and the session detail chalkboard. |

`SessionStatusTag` follows the same rules. With its word, it draws the icon and the word in the status colour, with no fill. Icon only, it draws the solid badge.

## Shape and depth

Corners use the **Tight scale**, set by the radius variables in the `@theme` block: `rounded` is 4px, `rounded-sm` 2px, `rounded-md` 4px, `rounded-lg` 6px, `rounded-xl` 8px, `rounded-2xl` 12px and `rounded-3xl` 16px. `rounded-full` stays round, for pills, dots and avatars. Ledger's own 2px felt too harsh on CSM's larger panels, so CSM sits one step softer.

Before October 2026, the theme overrode these with much larger values (`rounded-lg` was 16px and `rounded-xl` 28px). If a component looks oddly square now, it was written against those, and the fix is a smaller class, not a bigger radius in the theme.

Shadows are Tailwind's own light values. The theme used to override them with 30% to 50% black, which made every card look like it was floating. Per "rules before shadows", an in-page card shouldn't need more than `shadow-sm`, and often needs none.

## The page background

The background behind the pages is a choice people make under **Background** in the user menu, next to Theme. Plain is the default, and the wood desk is the other option. The choice is stored per device.

Each background is an entry in `SURFACES` in `lib/surfaces.ts`, plus a block of `--surface-*` variables in `globals.css` keyed on `data-surface`. Pages draw it through `PageSurface` (`components/layout/PageSurface.tsx`) and the `surface` classes, and never draw a background of their own. To add a background, for example for another deployment, add one entry and one light and one dark CSS block that set every variable. No page needs to change, and the picker previews the new entry with the same CSS.

A boot script in the root layout puts the choice on `<html>` before the first paint, so the desk doesn't flash plain on load. `SurfaceAttribute` keeps it in step after that.

## Type

The body face is Inter. Chinese falls through to Noto Sans TC.

Nothing on CSM's own pages is smaller than 11px. That's the size the supply order app uses for its smallest labels, and it's still clearly a label rather than shrunken body text. A few places are allowed smaller sizes, each for a reason: digits inside small fixed-size badges, page previews and thumbnails that shrink text on purpose, the student report pages laid out for export, and lesson mode. The dense calendar grids are still below 11px and are due a pass of their own.

The handwriting fonts (Caveat and the others loaded at the top of `globals.css`) belong to the classroom objects below, and nowhere else.

## Motion

Transitions use `--ease-out`, a smooth deceleration with no overshoot. `--ease-spring` points at it too. Framer Motion springs are damped to about critical (for example, stiffness 400 with damping 40), so things settle in place without wobbling. The bouncy Material "expressive" curves still exist in the theme for lesson mode, which may reach for them by name. Staff pages should not.

## The public pages

The summer and regular intake pages, their components (`app/summer`, `app/regular`, `components/summer`, `components/regular`), and the shared files they import (`components/ui/button`, `confirm-dialog`, `grade-label`, `modal` and `popover`, and `lib/summer-utils.tsx`) keep the look they had before October 2026.

The mechanism: a boot script in `lib/shape.ts`, built from the lists in `lib/public-routes.ts`, puts `data-shape="classic"` on `<html>` for every public route, and `LayoutShell` keeps it right on client navigation. Under that attribute, `globals.css` restores the old radius variables, the old oak and secondary text values, and, class by class, the old heavy shadows, including the `hover:` and `group-hover:` forms the public pages use. The shadows have to be restored that way because Tailwind writes the theme's shadow values into each class when it builds, so no variable can switch them back.

If you change a shared file the public pages import, check the public pages too.

## A trap when replacing colour pairs

Our dark variant is `@variant dark (&:is(.dark *))`. That gives a class like `dark:bg-[#2d2618]` higher specificity than a plain utility, and Tailwind emits it after the `hover:` and `focus:` rules. So in dark mode, a `dark:` class quietly beat any light-only colour on the same element. A token class like `bg-paper` has ordinary specificity, so swapping an `X dark:Y` pair for a token can let a `hover:`, `focus:` or conditional colour on the same element show through in dark mode, where before it was hidden.

It also happens across files. If you pass a token into a component whose own base classes include `dark:bg-gray-900`, tailwind-merge no longer drops that base class for you, and it wins in dark mode.

Before swapping a pair for a token, check that nothing else on the element sets the same property, and check whether the classes are passed into a component with its own base colours. Next's `Link`, the lucide icons and Framer's `Reorder.Item` pass classes straight through and are safe.

## Classroom objects

`lib/design-system/components/education/` holds skeuomorphic pieces from the earlier design: a sticky note, a flash card, an index card, graph paper and others. They still appear in a few places, such as error states. Use them sparingly, for moments that benefit from a little warmth, and not as everyday containers. They keep their own springs and handwriting fonts.

## Getting ready for other deployments

What a deployment can change today, without touching a page:
- the palette, by giving the role tokens new values
- the corner scale, through the radius variables
- the page background, through a new `SURFACES` entry

What still assumes CSM:
- The name "CSM Pro" and the logo are written into the sidebar, the shell and the page title.
- Grade labels (F1 to F6, P1 to P6) and branch codes (MSA, MSB) are written into components.
- There's no translation layer.
- About 3,400 hex colour classes remain. Most are near-duplicates of a role token, and they will move onto tokens over time.
