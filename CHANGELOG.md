# Changelog

## [2.0.15](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.14...v2.0.15) (2026-03-01)


### Bug Fixes

* Add consistent min-w-0 and truncate across dashboard grid cards ([a9d2856](https://github.com/kenny1934/tutoring-management-system/commit/a9d28569c5382c3c9d63fe99e0e074040fd29671))


### Improvements

* Deduplicate date formatters and enrollment utilities ([adca724](https://github.com/kenny1934/tutoring-management-system/commit/adca724893dfda748b8b1ba50ad090e2b4f7d882))

## [2.0.14](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.14) (2026-03-01)

### Bug Fixes

* Fixed student profile edits (name, phone, school, etc.) not saving
* Fixed dashboard cards (Today's Sessions, Tests & Exams) overflowing horizontally on narrow screens

## [2.0.13](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.13) (2026-02-27)

### New Features

* **Bulk Confirm Payment on overdue-payments page** — multi-select with checkboxes, section-level select all, and animated batch action bar with optimistic updates
* **Implicit & parametric curves in geometry editor** — curve mode selector (f(x), f(x,y)=0, x(t),y(t)) with MathLive input, t-range controls, and full serialization for save/restore
* **Click-to-edit plotted curves** — select any plotted curve to load its equation back into the input field; Update replaces the curve, Cancel returns to select mode

### Improvements

* Redesigned action button colors for better distinction: Undo (indigo), Extension (purple), Schedule Make-up (teal) — consistent across action buttons and chalkboard stubs
* Moved unpaid badge from a separate pill to a compact inline icon next to the student name on sessions list and dashboard
* Added within-cell sorting to monthly popover grid view for consistency with list view ordering
* Added optimistic updates to renewals page bulk Confirm Payment and Mark Sent actions for instant UI feedback

### Bug Fixes

* Fixed unpaid red student name being overridden by strikethrough gray in Weekly, Daily, Monthly, and MoreSessionsPopover views
* Fixed schedule make-up modal blocking slots that only contain cancelled sessions — conflict check now matches DB guard logic
* Fixed monthly popover grid view missing unpaid red and strikethrough styling on student names
* Fixed geometry editor modal footer (Insert/Cancel) pushed off-screen when function input bars are active — header and footer now pinned with scrollable middle section

## [2.0.12](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.12) (2026-02-27)

### New Features

* **Custom date picker popover** — replaced native date inputs with a calendar popover across sessions list, weekly, and daily grid views for better month navigation without triggering date changes
* **"Active" status filter** — new composite filter option that hides resolved sessions (Pending Make-up, Make-up Booked, Cancelled) in one click
* **Button restyling** — action buttons and View/Lesson links now have borders and shadows to visually distinguish them from info badges

### Improvements

* Improved vertical data density in sessions list and calendar views
* Push undo/cancel/edit action buttons to the right edge of session cards
* Session count moved to badge on toolbar icon for a cleaner toolbar
* De-emphasized resolved sessions with reduced opacity (Pending Make-up 0.8, Make-up Booked 0.6) while keeping action buttons at full opacity
* Hidden CW/HW/Rate buttons and View/Lesson links on resolved session cards
* Applied same action button cleanup to TodaySessionsCard on dashboard
* Made sessions toolbar more compact on mobile

### Bug Fixes

* Fixed cancelled enrollment's deadline still being used for session extension — after cancelling the latest enrollment, the system now correctly falls back to the previous enrollment's deadline
* Fixed unpaid red student name being overridden by strikethrough gray on rescheduled sessions
* Fixed right-aligned action buttons breaking layout in SessionDetailPopover and on mobile
* Fixed loading skeletons to match new sessions list layout
* Fixed time slot headers left-aligned on mobile, centered on desktop
* Fixed debug table horizontal scrollbar accessibility

## [2.0.11](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.11) (2026-02-23)

### New Features

* **Geometry editor drag-to-pan** — middle-click or right-click drag to pan the board in any tool mode; two-finger touch pan on mobile devices

### Bug Fixes

* Fixed terminated students dropdown showing current/future quarters that aren't ready for review
* Fixed documents page tab buttons overflowing on mobile

## [2.0.10](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.10) (2026-02-22)

### New Features

* **Document preview pane** — toggle a side panel to preview documents without leaving the list; includes print buttons (Questions Only / With Answers) and keyboard shortcuts (Enter to open, Escape to close)
* **My Docs & Recent tabs** — unified tab bar (All Docs | My Docs | Recent | Templates) replaces separate tabs and scope filters; My Docs shows documents you created or edited, Recent tracks documents you opened via localStorage
* **Pending make-ups view** — urgency-tier grouping (Critical / Warning / OK / Overdue) with collapsible tiers, lazy-loading pagination, 2-state sort toggle, root original date display, schedule make-up button integration, and aged pending make-ups notification bell item
* **Sort tiebreakers** — sessions with the same pending days now sort by location, then school student ID

### Performance

* Fixed infinite re-renders on pending-makeups view caused by Next.js 15 history patching and unstable context provider values
* Memoized all context provider values (Auth, Location, Role, CommandPalette, Toast) and SWRConfig
* Stabilized useActiveTutors hook, keyboard effect dependencies, and scroll handler

### Bug Fixes

* Fixed list view item backgrounds protruding past rounded container corners on mobile

## [2.0.9](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.9) (2026-02-22)

### New Features

* **Editable templates** — create, edit, and delete document templates from the frontend
* **Auto-delete empty docs** — untitled documents with no content are automatically deleted on exit; folder-scoped unique title enforcement
* **Last editor tracking** — display who last edited a document, separate from the original author

### Improvements

* Template visual styling and metadata display
* Document dropdown menus migrated to portal-based rendering for correct stacking
* Archived documents now clickable with in-editor archived banner and Restore button
* Footer pushed to page bottom on single-page documents
* Sidebar transition smoothed when switching document/template tabs
* Editor metadata moved inline with tags row on desktop
* Table button repositioned in Insert toolbar

### Bug Fixes

* Fixed Delete key removing last empty paragraph (acting like Backspace)
* Fixed single-page spacer jitter by using flex-grow layout
* Fixed tiptap min-height causing oversized single pages
* Fixed stale "Load More" button by deriving hasMore from data
* Fixed TestCalendar upcoming section theme colors

## [2.0.8](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.8) (2026-02-21)

### New Features

* **Version history** — side-by-side version diff with rich formatting, dynamic zoom, and layout comparison
* **Pagination architecture** — migrated from Widget Decorations to Node Decorations + React overlay for stable page division, headers, footers, and watermarks

### Improvements

* Mobile responsiveness and UX polish for document list
* Simplified document list with shared utilities
* Location dropdown styling in settings modal

### Bug Fixes

* Fixed code blocks printing with dark background — now uses light theme with print-safe syntax highlighting in all editor modes
* Fixed sidebar scroll shadows scrolling away instead of staying pinned
* Fixed page chrome overlay alignment — footer/header/gap overlays now correctly offset for CSS padding-box origin

## [2.0.7](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.7) (2026-02-21)

### New Features

* **Tags & folders** — organize documents with color-coded tags and a nested folder sidebar; tag search popover and inline editor tag dropdown
* **Table enhancements** — column resize, cell background color picker, and merge/split cells
* **Line spacing** — configurable line spacing for paragraphs and headings (1.0–3.0)
* **Page count** — status bar shows total pages when document has more than one page
* **{total} placeholder** — use `{total}` in headers/footers for "Page 1 of 3" style numbering
* **Justify alignment** — fourth text alignment option in toolbar and bubble menu
* **Link popover** — inline popover for inserting and editing links (replaces browser prompt)
* **Code blocks** — supported in document editor
* **8×8 table grid** — expanded table size picker for larger tables

### Improvements

* Document list pagination with sort controls and grid/list view toggle
* Image upload validation on document list
* Pagination footer stays at page bottom while typing; scroll position stable during page recalculation
* Backgrounds and colors print correctly; isolated lines avoided at page breaks
* Context menu accessible on mobile without hover
* Search on document list debounced for smoother typing; clear button added
* Empty state message adapts to active filters
* Keyboard shortcuts modal includes math and code block shortcuts
* Student coupon badge shows last-updated date on hover

### Bug Fixes

* Fixed document list theme contrast — missing dark mode variants on action buttons, low-contrast grey text against warm desk surface, and semi-transparent backgrounds letting desk texture bleed through
* Fixed mobile list view doc type icon not showing dark mode color
* Fixed archived document border style not rendering (invalid Tailwind class)
* Fixed context menus not closing on outside click
* Fixed Ctrl+S always triggers save for visual feedback
* Fixed answer section hover colors in dark paper mode
* Fixed staff referral checkbox not saving

## [2.0.6](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.6) (2026-02-20)

### New Features

* **Document Builder** — full A4 document editor with TipTap: rich text formatting, tables with grid picker, resizable images with alignment/text wrapping, math equations (KaTeX), and geometry diagrams (JSXGraph)
* **Page layout settings** — configurable margins, headers/footers with text templates ({title}, {page}, {date}), image logos, and separate English/Chinese font selection
* **Pagination system** — accurate page break calculation with visual page gaps, headers/footers rendered in decorations, and zoom-independent measurement
* **Print support** — browser-native print with correct page breaks, headers, footers, and watermarks; "Questions Only" and "With Answers" print modes
* **Answer Key section** — floating, collapsible answer overlay with drag-to-reposition and per-question labeling
* **Find & Replace** — search with highlight decorations, navigate between matches, replace current or all occurrences
* **Keyboard shortcuts modal** — categorized reference for all editor shortcuts (Ctrl+/)
* **Zoom controls** — zoom in/out with fit-to-width default on mobile; page breaks remain accurate at any zoom level
* **Paper mode** — document always displays in light/print colors regardless of global dark mode, with toggle in status bar
* **Document management** — create, duplicate, archive, restore, and permanently delete documents; mobile-responsive list view
* **Document templates** — create documents from templates (e.g. MathConcept) with pre-configured margins, footer, watermark, and body font
* **Body font settings** — new Fonts tab in Page Layout modal to set default font family (English + CJK) and font size for the document
* **Block indent/outdent** — Tab/Shift+Tab to indent or outdent paragraphs and headings (up to 8 levels); toolbar buttons in Format tab

### Improvements

* Resizable media nodes support drag handles, alignment (left/center/right), and text wrapping
* Tabbed toolbar layout with search and keyboard shortcuts buttons
* Bubble menu for inline formatting on text selection
* Explicit page break nodes insertable from toolbar
* Documents section in sidebar with Beta badge
* Toolbar font and size dropdowns reactively reflect the cursor-selected text style

### Bug Fixes

* Fixed watermark only appearing on first page in editor view
* Fixed decoration watermark greyish overlay in light mode and white pixels in dark mode

## [2.0.5](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.5) (2026-02-16)

### New Features

* **Code blocks with syntax highlighting** — toggle via toolbar button or type ``` in the editor; ~35 common languages auto-detected with Catppuccin Mocha color theme; highlighting preserved in sent messages
* **Drag-and-drop attachment reordering** — drag images horizontally or files vertically (with grip handle) to reorder before sending, in both reply composer and compose modal

### Improvements

* Scheduled messages now deliver reliably via background task even if the sender doesn't reopen their inbox
* Math editor templates insert at cursor position instead of replacing the entire equation
* Snoozed and scheduled message lists load faster with batched queries

### Bug Fixes

* Fixed segment measurement labels not updating color when switching between light and dark mode
* Fixed measurement label colors reverting to stale values on undo/redo

## [2.0.4](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.4) (2026-02-15)

### New Features

* **Interactive geometry editor** — draw points, lines, segments, circles, polygons, function graphs, text labels, and angles on an interactive JSXGraph board; hexagon toolbar button in the inbox editor
* **Geometry viewer** — click sent diagram thumbnails to open an interactive read-only viewer with zoom in/out/reset controls and drag-to-pan
* **Function graphing** — plot mathematical functions via LaTeX input with MathLive virtual keyboard, converted to JS and rendered as curves on the geometry board
* **Theme-reactive geometry boards** — boards re-render with correct colors when switching between light and dark mode
* **Grid snapping** — toggle snap-to-grid in the geometry editor toolbar (on by default) for precise point placement at integer coordinates
* **Auto-named points** — points are automatically labeled A, B, C, ...; click a point in select mode to rename it
* **Touch support** — geometry editor and viewer optimized for touch devices with larger hit targets and no browser gesture interference
* **Area-select & group movement** — drag a selection rectangle over compound elements (angles, polygons, circles, segments) then drag any defining point to move the entire shape as a unit
* **Polygon interior dragging** — click inside any polygon to drag it by its interior
* **Exact angle input** — type a degree value in the text field when placing an angle to auto-compute the third point at the exact angle

### Improvements

* Snap-to-grid toggle now updates all existing points on the board
* Theme toggle updates geometry board colors smoothly without visible flash

### Bug Fixes

* Fixed MathLive menu button requiring long press to open
* Fixed matrix equations showing "amp" text in sent messages
* Fixed doubled axis tick labels in geometry viewer
* Fixed invalid geometry thumbnails not rendering

## [2.0.3](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.3) (2026-02-15)

### New Features

* **Math equations in inbox** — type `$...$` for inline or `$$...$$` for block math, rendered with KaTeX; Sigma toolbar button converts selected text to equations; click to edit existing equations
* **Math equation editor modal** — dedicated editor with MathLive mathfield and virtual keyboard for visual equation input; supports inline/block mode toggle with descriptions, edit/delete existing equations, and Ctrl/⌘+Enter shortcut to insert
* **Themed virtual keyboard** — MathLive keyboard styled with warm brown palette matching app design, with full dark mode support

### Bug Fixes

* Fixed send button disabled when message contains only math equations
* Fixed math equations disappearing from message bubbles
* Fixed memory leak in math editor modal
* Fixed focus not returning to message editor after closing math modal
* Fixed math input border invisible in dark mode

## [2.0.2](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.2) (2026-02-14)

### New Features

* **Chat-style thread view** — redesigned inbox thread detail with message bubbles, avatars, date separators, and typing indicators
* **Scheduled send** — compose messages with schedule picker (preset times or custom datetime), inline edit before send, delivery timestamp updated on send
* **@Mentions** — type `@` in the editor for autocomplete, mentions stored and surfaced in dedicated Mentions sidebar with unread badge and priority notifications that bypass thread mute
* **Snooze** — snooze messages with preset or custom times, background task automatically marks as unread when snooze expires via SSE
* **Voice messages** — record audio via microphone, upload to cloud storage, inline AudioPlayer with waveform visualization
* **Message templates** — quick-insert reusable message templates from a picker
* **Link previews** — automatic Open Graph previews for URLs in messages
* **Emoji reactions** — react to messages with emoji, displayed as pills below message bubbles

### Improvements

* **Sidebar reorganization** — 3 sections: primary mailboxes, smart views (Starred, Mentions, Send Later, Snoozed), and collapsible Tags
* **Rich interactions** — quote-reply, message forwarding, swipe actions, keyboard shortcuts
* **Paste/drag image uploads** — supports multiple images at once
* **Search highlighting** — across thread list and message content
* **Draft auto-save** — with thread list preview indicator
* **Dark mode polish** — across all new components
* **Performance** — faster navigation and smoother category switching
* **Video & GIF attachments** — send and preview video/GIF files inline in messages
* **Message forwarding with attachments** — forwarded messages now include all original attachments (images, files, voice recordings)
* **Categorized attachment menu** — attachment button opens a popover with Photos & Videos / Document sections
* **File attachments in replies** — attach files when replying, with thumbnail previews and remove button
* **Improved toolbar dropdowns** — emoji, color picker, attachments, and template menus no longer get clipped on mobile or in edit mode
* **Slide animations** — smooth expand/collapse on search filters panel and collapsible sections

### Bug Fixes

* Unread counts now exclude scheduled (unsent) messages
* Fixed inbox loading indicator getting stuck when switching categories
* Fixed snooze reminders firing at wrong times due to timezone mismatch
* Fixed scheduled messages occasionally being sent twice
* Fixed threads sometimes getting pinned twice
* Fixed voice message icon not displaying correctly
* Fixed voice message duration not saving correctly
* Fixed console warning in rich text editor
* Fixed changelog markdown rendering on What's New page

## [2.0.1](https://github.com/kennygodin/tutoring-management-system/releases/tag/v2.0.1) (2026-02-13)

### New Features

* Group messaging — send messages to multiple specific tutors (not just one or all)
* Multi-select recipient picker with tutor checkboxes and chip display
* Group messages show "Group (N)" badge in thread list and green highlight in thread detail
* Reply to group message inherits original recipients

### Improvements

* Message pinning/starring across all inbox views (inbox, archived, categories)
* Inbox sidebar reorganized into Mailboxes and Categories sections
* Draft auto-save for compose and reply forms
* Batch "Mark All Read" for current category or entire inbox

## [2.0.0](https://github.com/kennygodin/tutoring-management-system/releases/tag/v2.0.0) (2026-02-13)

### New Features

* Launch of CSM Pro web application — a complete rebuild from the original AppSheet v1.x
* Dashboard with real-time stats, activity feed, and notification system
* Session management with attendance tracking and make-up proposals
* Student enrollment lifecycle with fee calculation and renewal tracking
* Inbox messaging system with threads, search, and categories
* Courseware library with usage analytics
* Revenue reporting and overdue payment tracking
* Exam revision slot management
* Role-based access control (Super Admin, Admin, Supervisor, Tutor, Guest)
* Command palette (Ctrl+K) for quick navigation
* Dark mode support
