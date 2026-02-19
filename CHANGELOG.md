# Changelog

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

### Improvements

* Resizable media nodes support drag handles, alignment (left/center/right), and text wrapping
* Tabbed toolbar layout with search and keyboard shortcuts buttons
* Bubble menu for inline formatting on text selection
* Explicit page break nodes insertable from toolbar
* Documents section in sidebar with Beta badge

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
