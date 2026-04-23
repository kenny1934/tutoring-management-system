# Changelog

## [2.0.60](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.60) (2026-04-23)

### New Features

* **All-staff leave balances for admins**: new "All Staff" tab in the Leave quick-link shows every active staff's Annual, OC, Birthday, and Sick Leave remaining, with search and branch scoping from the sidebar location picker
* **Supervisors can open the ARK dashboard**: the leave/HR quick-link now works for Supervisor accounts, auto-provisioning them on first visit to ARK
* **Supervisor-tailored Leave quick-link**: Supervisors see Review, Calendar, and All Staff tabs (defaulting to Review), and the ARK footer link for admins and Supervisors now opens straight to the matching tab in ARK

### Bug Fixes

* **Missing entries on unchecked attendance**: tutors (and anyone with a location filter) now see the unchecked sessions that the notification bell was counting
* **Termination rate precision**: term rate percentages on the Terminated Students page now round to true two decimal places (e.g. 6.67% instead of 6.70% for 5/75)

## [2.0.59](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.59) (2026-04-23)

### New Features

* **Arrangement workflow status chips**: quick chips at the top of the arrangement page filter by All, Unplaced, Incomplete, Placement Offered, or Confirmed, with a panel toggle so the incomplete side list matches the same cut
* **Workflow status icons on placed rows**: small icons next to placed students show at a glance who still needs a fee message, needs confirmation, or is fully done
* **Global student search on the arrangement page**: type a name or CSM student ID in the page header and jump straight to that student's slot, falling back to the calendar if they're still unplaced
* **Students tab filter rework**: filters on the Students tab now match the arrangement page vocabulary (location, grade, buddy state, workflow status) with cleaner chips and a dedicated search
* **Applications search by linked student ID**: the applications list and unassigned side panel now match on CSM student ID in addition to name
* **Smarter prospect link suggestions**: fuzzy-name matching catches typos and reordered characters, and already-linked applications are skipped so suggestions only show genuine candidates

### Bug Fixes

* **Marketing snapshot card on mobile**: shrunk padding, hid the long description, and shortened the button label so the card no longer dominates the stats view on narrow screens
* **Demand-bar click filter restored**: clicking a grade bar on the slot grid now correctly filters the side panel by day and time slot again
* **Rescheduled placement delete**: renamed the calendar action to "Reschedule" and let admins delete an already-rescheduled placement without having to revert it first
* **Placement dot alignment**: dots in the placement strip now line up with lesson numbers and reflect post-publish session status (cancelled, rescheduled)
* **Slot chip label wrap in admin edit pane**: long slot chips now wrap instead of forcing horizontal overflow
* **Prospect link popover**: right-aligned so it no longer clips off the right edge of narrow rows

## [2.0.58](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.58) (2026-04-22)

### New Features

* **Animal emojis on the dashboard**: the greeting at the top now has a chance to pick one of 36 new animal emojis

### Bug Fixes

* **Tutors can save termination reasons**: reason and category edits on the Terminated Students page no longer fail for non-admin users
* **Instant save feedback on Terminated Students**: saved reasons and categories now appear immediately instead of briefly reverting while the page reloads
* **Trials quicklink student names**: restored normal name size in the dashboard trials popover (was accidentally shrunk to the dense summer-calendar size)

## [2.0.57](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.57) (2026-04-22)

### New Features

* **Lesson number editing on published summer sessions** — inline edit via badge on session detail and popover, per-student overrides that survive reschedules, a duplicate-number guard that returns a clear error, and duplicate L# highlighting on the students table
* **Ad-hoc Make-up Slots** — admins can spin up one-off slots off the weekly grid for rescheduled lessons; off-grid dates render as make-up cards on the arrangement calendar
* **Live session data on published applications** — the arrangement grid and application modal now read live session state after publish, so rescheduled, edited, and cancelled lessons show their current details instead of the frozen plan
* **Divergence cues + eye icon on placement rows** — an icon-only orange pill marks rows that have drifted from the original plan, with a tooltip showing the original schedule; an eye icon on post-publish rows opens the session detail popover directly, so admins can reschedule, edit, or cancel without leaving the calendar
* **Placement rows jump to calendar** — clicking a placement row in the application modal navigates to the matching week and branch, expands the card, and rings the target student row
* **Delete placement post-publish** — remove a single published session from an application while keeping notes intact
* **Auto-suggest modal reorg** — cards collapsed by default with attention icons, sticky filter bar (search + quality chips + select-visible), a Ready-to-place section pre-selected up top, and a Needs-review section that auto-expands without pre-selection
* **Calendar density controls** — toggle day columns on slot setup and the arrangement grid to hide empty or unneeded days and reclaim horizontal space
* **Mixed-lesson indicators** — slot cards show a dot when students are on different lesson materials, and rows with divergent lesson numbers render their own L# badge
* **Linked CSM student chip on arrangement rows** — slot rows and calendar cards surface the matched CSM student identity alongside the applicant name

### Bug Fixes

* **Lesson-number cache staleness** — post-publish lesson number edits now propagate immediately across views instead of waiting for a refresh
* **Unpublished placement lookup** — calendar navigation now routes via the SummerLesson FK to avoid stale lookups
* **Auto-suggest sticky filter bar** — filter bar now sits flush at the top of the scroll area when scrolled

## [2.0.56](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.56) (2026-04-11)

### New Features

* **Arrangement page revamp** — enriched incomplete panel cards (branch chips, buddy dots, status indicators, placement dot strip), bulk session confirm (per-slot and per-location), student table to calendar navigation, buddy co-placement hints during drag
* **Demand sparklines** — slot grid cells show per-grade mini stacked bars (solid = 1st pref, light = 2nd pref) with global max relative sizing for cross-cell comparison
* **Clickable demand bars** — click a grade bar to filter the side panel to students who chose that slot as their 1st or 2nd preference, fetching all applications (not just unplaced)
* **Auto-suggest partial placement** — algorithm now tolerates up to 2 date-excluded lessons, creating them as "Rescheduled - Pending Make-up" on the original date. Offers an "Option B" with make-ups when non-preferred slots would otherwise be used
* **Calendar overlay in auto-suggest** — the date constraint panel now shows colored dots on suggested lesson dates, with hollow circles for pending make-up lessons
* **Rescheduled session styling** — sessions with "Rescheduled - Pending Make-up" status display with orange tint, AlertTriangle icon, and strikethrough across calendar, slot cards, and detail modal (matching the sessions page convention)

### Bug Fixes

* **Status flow correction** — placing sessions now bumps application status from Submitted to Under Review (not Placement Offered). Placement Offered and Confirmed are reserved for when fee messages are sent to parents
* **Auto-suggest for MSB** — fixed auto-suggest returning no results for MSB location by generating lessons before running the algorithm
* **Rescheduled sessions excluded from capacity** — sessions marked as rescheduled no longer count towards slot or lesson capacity, freeing seats for other students

## [2.0.55](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.55) (2026-04-11)

### New Features

* **Wolfram Alpha query panel** — tutors can query Wolfram Alpha directly during lessons via a slide-in panel (press W or click the Sigma button in the header). Results display as a zoomable image with click-to-zoom via the existing lightbox
* **Math keyboard input** — toggle the f(x) button to switch from plain text to a MathLive math keyboard for structured input. LaTeX is automatically converted to Wolfram-compatible syntax
* **Query caching** — repeated queries return instantly from a 24-hour backend cache (200 entry cap), saving API quota. Cached results show a green "Cached result" badge
* **Persistent query history** — past queries are saved in localStorage (up to 30) and persist across sessions. A collapsible history panel lets tutors browse and re-run previous queries
* **Cross-user Google Drive title fetch** — URL exercise titles now fetch correctly for Google Docs stored in any workspace user's Drive, not just the admin's. Uses service account delegation to impersonate the current tutor, with session tutor and admin fallback
* **Google Docs sharing hint** — lesson mode shows a "Can't see the file? Ask the owner to share it with you" hint below Google Docs iframes

## [2.0.54](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.54) (2026-04-11)

### New Features

* **Expanded URL exercise support** — embed YouTube videos, Desmos graphs, GeoGebra tools, PhET simulations, Kahoot quizzes, and Polypad manipulatives directly in lesson mode. Wayground and Mathigon links open in a new tab
* **Type badges** — URL exercises now show colored badges (Video, Math, Sim, Quiz, Slides, Doc, Link) in lesson sidebars, student courseware tab, recap items, and exercise history
* **Resource directory** — a new "Browse Resources" dropdown in the exercise editor helps tutors discover educational platforms with link format guidance and embed behavior hints
* **Editable URL titles** — the auto-fetched title field is now an editable input, so tutors can manually name exercises when auto-fetch fails or returns a bad name
* **Title fetch for any URL** — pasting a YouTube, Desmos, PhET, or any HTTPS link auto-fetches the page title. YouTube uses the oEmbed API for reliability
* **YouTube thumbnail preview** — hovering over the YouTube icon in lesson sidebars and exercise modals shows a thumbnail preview of the video
* **Iframe embed code paste** — pasting an iframe embed code (e.g., from Polypad) automatically extracts the URL

### Bug Fixes

* **Duplicate key warning** — fixed React key collision in SessionDetailPopover when URL exercises have no PDF name

## [2.0.53](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.53) (2026-04-11)

### New Features

* **URL exercises** — tutors can now paste Google Slides, Docs, or Sheets URLs as classwork or homework alongside regular PDFs. The URL auto-detects on paste, shows an embedded iframe in lesson mode, and gracefully skips URL exercises during print/download operations
* **Auto-fetch URL titles** — when a Google Docs/Slides/Sheets link is pasted, the presentation title is automatically fetched via the Drive API and displayed everywhere: exercise modals, lesson sidebars, session detail, student courseware tab, reports, and exercise history

## [2.0.52](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.52) (2026-04-10)

### Bug Fixes

* **Ghost sessions respect tutor filter** — proposed make-up sessions on the Sessions page and Today's Sessions card now correctly hide when a tutor filter is active, instead of showing every pending proposal regardless of tutor

### New Features

* **Kahoot! in Tools quicklinks** — added a direct link to Kahoot in the dashboard Tools dropdown for quick access during lessons

## [2.0.51](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.51) (2026-04-10)

### Improvements

* **Placement details in the application card** — placed students now show a progress strip with date range, colored status dots (green = confirmed, amber = tentative), and a placed/total count alongside their preferences, instead of repeating the same day and time for every lesson
* **Placement details in the detail modal** — each session row now shows the actual lesson date, day, start time, class grade, tutor name, and current slot capacity, matching the information density of the arrangements page
* **Consistent section icons** — the card and detail modal now use the same icons for schedule preferences and placement sections

## [2.0.50](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.50) (2026-04-10)

### New Features

* **Summer applications — unified toolbar** — stats, filters, and count strips collapsed into a single row with Status, Arrange, and More menus; location now lives as a scope in the page header with the same All/branch semantics as other admin pages
* **Buddy board view** — alternate view for the applications page that groups members by buddy code and buckets groups by how close they are to the next discount tier (config-driven), so the "one more buddy to unlock Early Bird Group of 3" cohort surfaces at a glance
* **Branch origin filter** — new More-menu filter that scopes the list to a specific branch (MAC, MSA, …) or shows only "New" applicants with no linked student or claim
* **Link suggestions modal** — single admin modal that surfaces both auto-match candidates (Primary prospects) and duplicate-student candidates (Secondary branches) in one place, with per-row "Link this" inline actions and strict auto-link thresholds
* **Fee breakdown in the detail modal** — shows the applicable discount code, amount, and final fee for each applicant, plus a "one more buddy to unlock {tier}" nudge when the group is near the next tier. Group-size discounts now honour the moment the group actually reached N members, including admin reassignments and post-submission joins
* **Prospects auto-match preview** — clicking Auto-Match now opens a dry-run preview showing exactly which prospects would link and which would be skipped (with reason and conflicting rows); ambiguous cases can be resolved inline
* **Prospects WeChat filter** — filter the admin prospects list by whether the imported contact data already has a WeChat handle, so "who can I message right now" is one click
* **Filter-aware branch pills** — the top branch pills on the prospects page now re-count themselves against the active filters, so selecting "Has WeChat" (or any other filter) shows the per-branch counts for that slice

### Improvements

* **Applications list — redesigned card** — clearer hierarchy, inline status editing, buddy meter that counts actual group members plus declared siblings, originating-center chip, unavailability notes truncation, reference-code copy on hover, placed-slots tooltip, pending-sibling signal, reviewed-at timestamp
* **Applications list — virtualized rendering** — large lists no longer jank while scrolling
* **URL-synced filters** — toolbar state (filters, sort, view, preset) round-trips through the URL so links and page reloads restore the exact view
* **Unsaved-changes guard** — the detail modal now prompts before discarding edits when cancelling, closing, hitting Escape, or navigating prev/next
* **More dropdown on narrow screens** — portal-based positioning clamps the menu to the viewport so it no longer overflows on small screens
* **Duplicate-check hints in student search** — combined name/phone match reasons into a single row so the strongest signal is always visible

### Fixes

* **Prospects branch-count pills missing totals** — the admin stats endpoint was being shadowed by the single-prospect fetch route and silently returning 422, so pill counts went blank. Route order fixed
* **Applications — stale linked-student flash** — the detail modal no longer flashes the previous applicant's linked-student warning when navigating prev/next
* **Prospects — modal close button** — close now gives visual feedback and the linked-application status badge reflects the correct state

## [2.0.49](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.49) (2026-04-08)

### Fixes

* **Summer apply — confirmation step skipped** — clicking Next on step 4 could occasionally jump straight to the success page, bypassing the step 5 review and confirmation checkbox; the navigation buttons now fully unmount between steps so the submit action can never fire by accident
* **Dashboard leave quicklink — impersonation scope** — when an admin impersonates a tutor, the leave quicklink now reflects the impersonated tutor's balance instead of the admin's own

## [2.0.48](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.48) (2026-04-07)

### New Features

* **Summer application self-edit** — applicants can now edit their submitted form from the status page (time slots, location, school, grade, language stream, WeChat) as long as the application is still in Submitted state; once admin moves it to Under Review the form locks and a banner directs them to contact staff
* **Summer edit audit trail** — every change (applicant or admin) is captured in a per-field history visible in the admin detail modal, with timestamps, editor name, and old → new values
* **Admin application detail editing** — new "Edit details" toggle in the admin modal swaps identity, schedule, and preference fields into inline editors; moving an application out of Submitted now prompts a confirmation so admins know the applicant will lose self-service access
* **Sibling declaration on buddy groups** — secondary applicants with a younger sibling applying at a Primary branch (or KidsConcept) can declare them on the buddy group; admin confirms against the proprietary system and the sibling counts toward the 3-person discount threshold
* **Draft autosave** — apply form now saves in-progress data to the browser so a reload or accidental close doesn't wipe half-filled applications; a "Resume draft?" banner offers to restore it
* **Unload warning** — the browser now asks for confirmation before leaving the apply page with unsaved changes

### Improvements

* **Summer form — merged student-background question** — "Are you a current student?" and "Which center?" collapsed into one chip selector grouped by organisation, saving a tap
* **Summer form — tap-a-slot grid** — class time selection replaced the four cascading dropdowns with a visual day-by-time grid; tap once for 1st preference, again for 2nd
* **Summer form — pill selection** — center, grade, session frequency, and buddy mode chips no longer shift layout when selected; selection is signalled by colour alone following modern pill conventions
* **Summer form — brand WeChat icon** — WeChat ID field now uses the brand icon on the apply form, status page, and admin modal
* **Phone format tolerance** — summer applicants can now enter their number with spaces, hyphens, or parentheses without issue; the status page accepts any format on lookup
* **Duplicate detection** — same parent can now submit multiple siblings (same phone, different student name); the duplicate check correctly blocks same-student resubmissions only
* **Capacity headroom** — raised submission, status, and self-edit rate limits to tolerate shared school or office wifi; Cloud Run backend and frontend now scale up to 3 instances for failover and burst capacity
* **Admin modal — sibling verification UX** — pending sibling chips, confirm/reject buttons, and branch-tagged rows for cleaner verification workflow

### Fixes

* **Buddy cap race** — submitting with both a buddy code and a declared sibling now pre-flights capacity so the user gets the cap error before anything commits, instead of leaving the application saved with a confusing sibling error
* **Status page translation** — grade, language stream, and location now show their proper Chinese or English label based on the selected language, instead of the raw stored value
* **Admin config preview drift** — the admin form preview now stays automatically in sync with the real apply form as fields evolve

## [2.0.47](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.47) (2026-04-05)

### New Features

* **Waitlist** — track prospective students (New) and slot change requests with a searchable list view, bulk paste import, and filters by grade, type, and location
* **Waitlist timetable** — weekly grid overlay showing waitlist demand alongside enrolled students, with day-filter chips, cell heat tinting by occupancy, and collapsible tutor cards with capacity bars
* **Preferred tutor** — optional tutor preference per slot; entries appear inside the preferred tutor's timetable card with a "Waiting" section
* **Slot Change highlight** — collapsible card strip above the timetable showing current → preferred slot details; selecting an entry highlights the relevant tutor cards
* **Enrollment workflow** — link waitlist entries to students, schedule trials with a one-click prompt after student creation, and view enrollment details from the timetable

## [2.0.46](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.46) (2026-04-03)

### New Features

* **Copy All** — new toolbar button in the document editor copies all content (text, LaTeX math codes, and geometry diagram images) to the clipboard for easy export to other apps
* **Dual-format clipboard** — rich text targets (Google Docs, Word) receive formatted HTML with embedded images; plain text targets get text with `$LaTeX$` codes preserved

### Improvements

* **Responsive document toolbar** — History, Layout, and Copy All buttons collapse into an overflow menu on smaller screens to reduce crowding

## [2.0.45](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.45) (2026-04-02)

### New Features

* **ARK leave integration** — inline leave management dropdown on the dashboard with balances, request filing, and admin review — no more switching to ARK for common tasks
* **Leave balances** — expandable rows showing entitlement, carry-over, adjustments, and remaining days with a visual bar
* **File leave & overtime** — compact forms for submitting leave requests (with time range for partial days) and overtime records directly from the dropdown
* **Admin leave review** — approve or reject pending leave requests inline with optional reviewer notes
* **Team leave calendar** — month-view calendar for admins showing who's on approved leave with colored dots per leave type

### Improvements

* **Dashboard dropdown styling** — warm paper-cream background with texture, stronger shadows, and darker borders across all quick-link dropdowns
* **Compact request cards** — two-line leave request cards with expandable detail (reason, reviewer, filed date)
* **Upcoming/History filter** — My Requests tab defaults to upcoming leave, with a toggle to view past and cancelled requests
* **Cancel approved leave** — cancel button available on both pending and approved requests (approved cancellation restores balance)
* **Notification bell** — pending leave request count shown for admins alongside other notification items

### Bug Fixes

* **Leave day count** — now counts all calendar days instead of skipping weekends
* **Dark mode contrast** — fixed approve/reject button text, select dropdown background, and footer divider visibility
* **Dropdown corner bleed** — hover states on footers and form headers no longer poke outside rounded containers
* **Proposed sessions location filter** — makeup proposal ghost sessions now correctly filter by branch location

## [2.0.44](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.44) (2026-04-01)

### New Features

* **Worksheet OCR import** — upload scanned PDF worksheets and automatically extract content into the document editor with math, tables, and bilingual support
* **Question extraction & AI processing** — split worksheets into individual questions, generate step-by-step solutions and variant questions with one click
* **Documents page redesign** — table view with variant tree, folder sidebar with drag-and-drop, preview pane, bulk operations, tag management, and keyboard navigation
* **Answer sections** — collapsible inline answers in the editor with a printable answer key page

### Improvements

* **Math editor LaTeX source mode** — toggle between the visual editor and raw LaTeX for direct source editing
* **Editor mobile responsiveness** — toolbar collapses on small screens with touch-friendly targets
* **Smart question detection** — works with both OCR-imported and manually created worksheets
* **Print answer key** — shows document name, clean text over watermark, avoids splitting entries across pages
* **Print reliability** — page layout recalculates after fonts load to prevent content overlapping footers

### Bug Fixes

* **Page layout sometimes got out of sync** — content near page boundaries could overlap footers until a browser refresh
* **Watermark too dark in print** — appeared much darker than the editor due to duplicate elements stacking
* **Security fixes** — stricter permission checks on write endpoints and safer handling of special characters in tag filters

## [2.0.43](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.43) (2026-03-27)

### New Features

* **PDF page navigation bar** — bottom bar with prev/next buttons and a page number input for jumping directly to any page in multi-page exercises

### Bug Fixes

* **PDF preview flickering** — reduced unnecessary re-renders in lesson mode PDF viewers that could cause both exercise and answer panes to flash on high-DPI displays or slower devices

## [2.0.42](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.42) (2026-03-26)

### New Features

* **Prospect page overhaul** — floating action button with direct-submit drawer, paste-to-table form with field validation, arrow key navigation in school autocomplete, urgency highlights on submitted table, and bulk operations

### Improvements

* **Rate limits increased** — higher thresholds for shared WiFi environments where multiple staff connect from the same IP

### Bug Fixes

* **Keyboard shortcuts after bulk rating** — shortcuts on the sessions page stopped responding after closing the bulk rate modal until clicking something with the mouse
* **Prospect drawer name** — fixed the drawer capturing a stale student name after edits

## [2.0.41](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.41) (2026-03-25)

### New Features

* **Bulk attendance actions** — the unchecked attendance page now supports selecting multiple sessions with checkboxes and marking them all as attended or no-show in one click

### Bug Fixes

* **Printing .doc files now works** — print buttons across the app (session detail, exercise modal, lesson mode) were silently failing for `.doc`/`.docx` exercises; they now correctly fetch the converted PDF from Shelv before printing
* **Tutors can now add CW/HW and rate any session** — previously, tutors could only assign exercises and rate sessions under their own name; now any tutor can collaborate on any session

## [2.0.40](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.40) (2026-03-23)

### New Features

* **Summer course system** — full application workflow: public bilingual apply form, admin config editor with drag-and-drop slot management, application review dashboard, and timetable arrangement grid
* **Session-based scheduling** — calendar view with week navigation, lesson capacity tracking, student lesson tables, and find-slot dialog for manual placement
* **Auto-suggest placement** — lesson-level algorithm with pair ordering, date constraints, tutor preferences, and single-student suggest from the unassigned panel
* **P6 prospect module** — primary-to-secondary student feeder list with smart paste-to-table input, bulk operations (select, delete, set intentions, CSV export), and PIN-gated branch access
* **Prospect subdomain** — `prospect.` subdomain routing via middleware for branch-specific access
* **Admin auto-match** — automatically links P6 prospects to summer applications by phone number and year

### Improvements

* **Security hardening** — rate limiting on all public endpoints, Pydantic Literal validation for enums, year-scoped queries, PIN brute-force protection

## [2.0.39](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.39) (2026-03-23)

### Bug Fixes

* **Answer path paste now auto-converts drive letters** — pasting a Windows path like `V:\folder\file.pdf` into the answer field now auto-converts it to the correct alias format, matching the behaviour of the exercise path input
* **Answer download shows missing count** — the bulk answer download button now shows how many answers were found vs missing, instead of silently skipping unfound files
* **Per-exercise answer open/download Shelv fallback** — the open and download buttons on individual answer rows now fall back to Shelv when the file isn't found locally
* **HK timezone for date calculations** — all backend date operations now use Hong Kong timezone consistently, preventing date mismatches around midnight
* **Legacy renewal check** — candidate enrollments are now included when checking legacy renewal status
* **Calendar sync crash** — fixed crash when detecting orphaned calendar events with exam revision slots, which caused "Failed to load calendar events" on the dashboard
* **Make-up button colour** — the Schedule Make-up button on the Pending Make-up page now uses teal to match the session detail page

### Improvements

* **Answer open/download shows progress** — the answer open and download buttons now show a spinner with progress text (e.g. "Trying local file…", "Searching Shelv…") instead of appearing to do nothing
* **"Download Answers" shows live status** — the bulk download answers button now shows what it's doing (e.g. "Searching 1/3…", "Downloading 2 answer(s)…")
* **Raw drive letter paths now resolve** — file paths like `V:\folder\file.pdf` can now be opened, downloaded, and printed directly without needing alias conversion first

## [2.0.38](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.38) (2026-03-20)

### Bug Fixes

* **Layout fix for modals and error pages** — fixed an issue where modals, dialogs, and full-page error messages appeared extremely narrow instead of their intended width
* **Extension deadline preview** — the "New Effective End Date" shown when adjusting extension weeks now matches the actual calculated date, including holiday adjustments
* **Sessions tab popover crash** — fixed an error when opening the enrollment detail popover from the sessions tab on a student page
* **Guest dashboard** — guests no longer see failed network requests for admin-only data on the dashboard
* **Notification bell** — notification icon stays properly aligned when dashboard stats are hidden for guests
* **Dropdown on mobile** — fixed dropdown menus going off-screen when opening upward on small screens

### Improvements

* **Answer search copies page range** — the answer search button now copies the exercise's page range (simple or complex) into the answer fields, instead of only filling the PDF path

## [2.0.37](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.37) (2026-03-19)

### New Features

* **ARK leave quick link** — dashboard "Leave Record" now links to ARK's leave management with the ARK brand icon, Google Sheet links kept as fallback during transition
* **Cross-app SSO** — clicking the ARK leave link passes a handoff token so you're automatically logged in without needing to re-authenticate

## [2.0.36](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.36) (2026-03-19)

### Bug Fixes

* **Custom page order preserved** — entering page ranges like "8-15,5-6,16-18" now keeps pages in that exact order when viewing, printing, and downloading, instead of sorting them numerically
* **Rate & Comment modal cancel button** — fixed confirmation dialog appearing behind the modal when discarding unsaved changes

## [2.0.35](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.35) (2026-03-18)

### Bug Fixes

* **Reschedule & make-up for other tutors** — tutors can now reschedule sessions, schedule make-ups, and cancel make-ups for any student, not just their own sessions
* **Sick leave & weather cancellation** — same fix applied to sick leave and weather cancelled actions
* **Undo/redo across tutors** — undo and redo status changes now work regardless of which tutor owns the session

### Improvements

* **Read-only role enforcement** — Guest and Supervisor accounts are now properly blocked from all session changes on the server side, not just hidden in the interface
* **11 new backend tests** covering cross-tutor actions, ownership restrictions on attendance, and read-only role access control

## [2.0.34](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.34) (2026-03-17)

### New Features

* **Skills radar chart** — add a configurable spider chart to progress reports showing 4-8 custom skill attributes scored 1-5; choose between numerical or labeled display; saved per student so scores carry over to future reports
* **Save & view reports** — save progress reports internally with a single click; access past reports from a new "History" button next to "Generate Report" with auto-generated labels and one-click open or delete
* **Reorderable report sections** — drag-and-drop section order in the report config modal; the custom order applies to the generated report, shared links, and saved reports
* **Date range moved to top** — date range is now the first option in the report config modal for faster access

### Bug Fixes

* **Share link creation** — fixed "Failed to create share link" error after deployment
* **Radar chart on mobile** — fixed chart not appearing on small screens
* **Report print timing** — fixed reports occasionally printing before all data finished loading
* **Radar chart display mode** — fixed score display preference (numerical vs labels) not being remembered between sessions
* **Concept map error feedback** — concept map now shows a message when AI generation fails instead of silently disappearing
* **Delete and revoke feedback** — fixed false "failed" error messages when deleting saved reports or revoking share links
* **Share link revoke** — revoke button now shows proper error feedback instead of failing silently

### Improvements

* **Faster report history loading** — optimized database query for listing saved reports
* **Instant delete** — deleting a saved report removes it from the list immediately without waiting for a server response
* **Radar label limits** — attribute names are capped to prevent layout overflow in print/PDF
* **28 new backend tests** covering radar chart configuration and saved reports

## [2.0.33](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.33) (2026-03-14)

### New Features

* **Shareable parent reports** — tutors can generate a secure link to share progress reports with parents; parents open the link in any browser without login, seeing the same HTML report with full charts and formatting
* **Reports subdomain** — shared reports are served from `reports.mathconceptsecondary.academy`, keeping the internal tool domain hidden from parents
* **Share link deduplication** — clicking "Share Link" multiple times within 5 minutes reuses the same link instead of creating duplicates

### Bug Fixes

* **Share link creation** — fixed "Failed to create share link" error caused by a missing database column; added migration for `student_id` on `report_shares`
* **Server stability** — fixed an issue where heavy usage could temporarily make the app unresponsive; the server now auto-recovers without manual intervention
* **AI insights reliability** — fixed an error that could occur when generating AI learning summaries under heavy load
* **Shared report date** — shared report links now show the original generation date instead of the date the parent opens it
* **Print charts** — charts in reports no longer collapse to blank when printing or saving as PDF
* **Expired share cleanup** — expired report links are automatically cleaned up, keeping the database tidy
* **Topic chip overflow** — long topic names in report chips are now truncated to prevent layout overflow
* **Share link revoke** — revoke button now surfaces errors and only clears the URL on success

### Improvements

* **Mobile-friendly reports** — shared report links now display properly on phones with responsive layout, stacked sections, and scrollable tables
* **Share link refresh** — re-sharing a report within the dedup window now updates the link with the latest report settings
* **Rate limiting** — public share links are rate-limited to prevent abuse
* **Test coverage** — added 37 new backend tests covering report shares and student progress endpoints

## [2.0.32](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.32) (2026-03-14)

### New Features

* **Student progress report** — printable progress report accessible from the student detail page's progress drawer; configurable date range (presets: 1 month, 3 months, 6 months, 12 months, all time) with two modes: internal (full data) and parent (shareable summary)
* **AI learning summary** — generate a natural-language summary of student progress using Gemini, with concept map visualization; supports English and Traditional Chinese
* **Concept map** — interactive treemap of math concepts extracted from exercise filenames, categorized by topic (Algebra, Geometry, Trigonometry, etc.)
* **Report section toggles** — choose which sections to include in the report (attendance, rating, topics, tests, activity, enrollment, contacts); mode-aware toggles show/hide sections relevant to each report type
* **Test & exam timeline** — shows upcoming and past tests/exams matching the student's school and grade within the report period, with syllabus details

### Bug Fixes

* **Bulk print custom pages** — printing CW/HW in bulk now correctly uses custom page ranges (e.g. "pages 1,3,5-7") instead of ignoring them
* **Print fallback** — print buttons in lesson modes now properly search Shelv when a file isn't found locally
* **Session popover print** — individual and bulk print from the session detail popover now respects custom page ranges
* **Report print clipping** — fixed right-edge content being cut off when printing reports
* **Chinese proper nouns** — AI summaries in Traditional Chinese now preserve student and school names in their original form instead of transliterating

### Improvements

* **Print button feedback** — print buttons now show a spinner while working and display what's happening in the tooltip (e.g. "Searching by filename...")
* **Student ID layout** — student IDs (MSA-XXXX) in the lesson sidebar no longer wrap to a second line
* **File tab sorting** — students in the "by file" tab are now sorted to match the "by student" tab order
* **AI cost safeguards** — 30-second cooldown between AI generations, backend rate limit (5 calls/minute), and in-memory result caching (1-hour TTL) to prevent accidental overuse
* **AI context filtering** — unchecked report sections are excluded from the AI prompt context, so narratives only reference data the user chose to include
* **Report config modal** — report configuration moved from inline panel to a dedicated modal for cleaner UX; AI content section clearly separated from report sections

## [2.0.31](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.31) (2026-03-13)

### New Features

* **Student progress drawer** — expandable analytics panel in the student detail header showing attendance summary, performance rating trends, exercise breakdown, enrollment timeline, parent contact summary, and monthly activity charts
* **Trend delta badges** — 30-day vs previous 30-day attendance comparison and recent vs overall rating comparison with arrow indicators and tooltips explaining each metric
* **Clickable summary cards** — each metric card in the progress drawer navigates to the relevant tab (sessions, ratings, courseware, profile)

### Improvements

* **Optimized progress queries** — merged attendance trend calculation into a single SQL query instead of two separate round trips
* **Consistent badge colors** — enrollment type and contact method/type badges in the progress drawer now match the colors used in the Profile and Parent Contacts tabs
* **Enrollment timeline trimming** — shows 2 most recent enrollments with a "View all" link to the Profile tab

### Bug Fixes

* **Total sessions count** — progress drawer now correctly excludes rescheduled and cancelled sessions from the total
* **Recharts tooltip collision** — resolved build error from duplicate Tooltip import between Recharts and UI tooltip component
* **Loading skeleton** — added progress button placeholder and corrected tab count in the student detail loading state

## [2.0.30](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.30) (2026-03-12)

### Bug Fixes

* **Frontend version display** — fixed version number not updating in settings modal and "What's New" notifications
* **Health check** — endpoint now returns HTTP 503 when database is unreachable, so Cloud Run can route traffic away from unhealthy instances

### Improvements

* **Code cleanup** — consolidated duplicate logic, hardcoded values, and repeated database query patterns across backend and frontend
* **Batch operation performance** — batch mark-paid and mark-sent now load all enrollments in a single query instead of one per enrollment
* **Exam revision performance** — batch-resolve makeup session chain lookups instead of querying one-by-one
* **Zen mode performance** — memoized context providers to prevent unnecessary re-renders
* **Renewal check performance** — batch-query renewal and schedule overlap lookups instead of per-enrollment queries
* **Reduced unnecessary API calls** — disabled automatic refetch on window focus globally
* **Accessibility** — added screen reader labels to icon buttons and dialog attributes to modals
* **Dashboard & session list performance** — memoized attention card and proposed session components to reduce re-renders
* **Crash resilience** — added error boundaries around dashboard charts, document editor, inbox thread panel, courseware PDF preview, and termination charts so a crash in one component doesn't take down the whole page
* **Template delete safety** — added confirmation prompt before deleting message templates
* **Smaller Docker image** — replaced dev headers with runtime-only library in backend production image
* **Test coverage 5x increase** — grew from ~134 to 646 tests (326 backend, 320 frontend) across 5 batches covering fee calculation, session scheduling, quarter boundaries, exam revision, rate limiting, HTML sanitization, SQL safety validation, revenue bonus tiers, LaTeX-to-JS conversion, makeup proposals, and 20+ utility modules

### Security

* **Messages router authentication** — all 39 messaging endpoints now require JWT authentication with tutor ownership verification, preventing unauthorized access via spoofed tutor_id parameters
* **Parent communications write protection** — POST, PUT, and DELETE endpoints now require authenticated non-read-only users
* **Exam revision slot protection** — slot update and delete endpoints now require JWT authentication
* **Document processing authentication** — PDF handwriting removal endpoints now require JWT authentication
* **Dashboard data protection** — stats, locations, active students, and activity feed endpoints now require authenticated users
* **Backend URL hardening** — moved Cloud Run backend URL from source code to environment variable
* **Security headers** — added Permissions-Policy (restricts camera, geolocation, payment) and Cross-Origin-Opener-Policy (Spectre protection)
* **Request logging** — all API requests now log method, path, status code, and duration for observability
* **Explicit Cloud Run settings** — memory, CPU, concurrency, and ingress now set explicitly in deploy config

## [2.0.29](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.29) (2026-03-12)

### New Features

* **Bulk exercise assignment in wide mode** — assign CW/HW to multiple students at once via student picker popover in the lesson wide mode sidebar (both by-student and by-file views)
* **Clipboard paste in bulk modal** — exercises copied from ExerciseModal (Ctrl+C) can now be pasted into BulkExerciseModal (Ctrl+V) with confirmation dialog and source student info
* **Multi-select bulk delete** — select multiple exercises via checkboxes and delete them all at once with an inline red confirmation banner; Alt+Backspace shortcut support
* **PDF dark mode** — toggle button on all PDF viewers inverts page colors for comfortable dark reading; persisted via localStorage across PdfPageViewer, PdfPreviewModal, and Zen viewers

### Bug Fixes

* **Nested button hydration error** — fixed Next.js hydration warning caused by a print button nested inside the exercise item button in the lesson sidebar

## [2.0.28](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.28) (2026-03-11)

### New Features

* **Select Attended sessions** — bulk-select attended sessions for CW/HW assignment and rating via new dropdown menus on both the sessions page and dashboard card; Ctrl+Shift+A now cycles through markable → attended → clear with toast feedback on each press
* **Lesson mode print buttons** — single lesson mode now has bulk CW/HW print dropdown and per-exercise print buttons in sidebar; wide lesson mode adds per-student CW/HW print buttons in Students grouping

### Improvements

* **Toast feedback on selection** — all select actions (markable, attended, per-slot) now show info toasts with count or "none found" message instead of failing silently
* **J/K navigation respects collapsed sections** — keyboard navigation now skips over collapsed time slot sections; Ctrl+A and Ctrl+Shift+A also only operate on visible (non-collapsed) sessions

### Bug Fixes

* **Student detail popover** — now shows all contact phone numbers with labels instead of only the single legacy phone field

## [2.0.27](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.27) (2026-03-11)

### New Features

* **Bulk rate & comment** — rate and comment on multiple sessions at once from any timeslot header; copy timeslot info to clipboard
* **Bulk exercise actions** — Print All, Download All, and Download Answers buttons on CW/HW section headers in both session detail and student courseware tab
* **Courseware tab redesign** — consolidated layout with one card per session, CW/HW sub-grouping with colored accents, inline open/print buttons per exercise, and styled filter toggle
* **Clickable test alerts** — upcoming assessment entries on the session detail page now link directly to the exam revision page
* **Esc keyboard shortcut** — press Escape on session detail page to navigate back

### Improvements

* **Courseware tab readability** — darker text, opaque backgrounds, and StickyNote empty states for wooden desk theme in both courseware and tests tabs
* **Print stamps on exercises** — open/print actions now include student info stamps

### Bug Fixes

* Fixed exams page back button always navigating to home instead of the actual previous page
* Extracted shared `useBackNavigation` hook to consolidate duplicated history-aware back navigation

## [2.0.26](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.26) (2026-03-11)

### New Features

* **Multiple contact numbers** — students can now have multiple phone numbers with relationship labels (Mother, Father, Grandparent, Student, Guardian, or custom free text); contacts are editable on the student detail page and add student modal
* **Contact search** — search by any contact phone number across the student list, command palette, and duplicate detection

### Improvements

* **Contacts displayed everywhere** — enrollment detail modal, command palette preview, zen student page, and command palette subtitle all show full contact details with labels

## [2.0.25](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.25) (2026-03-10)

### New Features

* **Haptic feedback** — tactile vibration on mobile for toasts, confirm dialogs, star ratings, action buttons, inbox reactions, voice recording, swipe gestures, and more via web-haptics with Android-optimized raw vibration patterns
* **Tests & exams in command palette** — search tests and exams directly from the command palette with preview panel
* **Feedback email notifications** — superadmin receives a Gmail email when tutors submit bug reports, feature requests, or suggestions via the feedback panel

### Improvements

* **Documents read-only for supervisors** — supervisors can view documents but cannot create, edit, delete, duplicate, lock, or manage folders; backend write endpoints return 403 for read-only roles

### Bug Fixes

* Fixed session cards jumping position when marking attendance (Attended/No Show now sort in place)
* Fixed command palette recent searches saving on every keystroke instead of on selection
* Fixed inbox emoji picker closing after every emoji selection — now stays open until you click away
* Fixed unchecked attendance status column using plain gray pill instead of color-coded status tags

## [2.0.24](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.24) (2026-03-10)

### New Features

* **GIF messaging** — search and send GIFs via GIPHY in inbox replies and compose, with trending browse and debounced search
* **Supervisor broadcast inbox** — supervisors can now view broadcast messages in a read-only inbox (no compose, reply, react, or archive)

### Bug Fixes

* Fixed geometry editor undo/redo not respecting snap-to-grid setting

## [2.0.23](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.23) (2026-03-10)

### Improvements

* **Eligible students based on slot locations** — eligible student count and list now reflect only the locations where revision slots exist, since cross-location revision is not allowed
* **Discard warning on calendar event modal** — closing the event editor with unsaved changes now shows a confirmation prompt

### Bug Fixes

* Fixed voice messages showing 0:00 duration until played (WebM metadata workaround)
* Fixed eligible students expanded list not matching collapsed count when "All Locations" is selected
* Fixed exam-based eligible students endpoint not excluding already-enrolled students

## [2.0.22](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.22) (2026-03-09)

### New Features

* **Zen inbox** — full inbox page in zen mode with thread viewing, media attachments, emoji reactions, and reply composer with file upload
* **Unsaved annotation warning (lesson wide mode)** — exit confirmation dialog with "Download All & Exit" batch ZIP download, browser tab close warning, and `s` shortcut for saving current exercise
* **Unsaved annotation warning (zen lesson mode)** — exit dialog now offers three options: Download All (ZIP), Download Current, and Exit; plus browser tab close warning
* **Non-PDF fallback to Shelv** — local .doc/.docx files in lesson mode now fall through to Shelv search instead of failing

### Improvements

* Faster inbox refresh using background revalidation instead of full reload

### Bug Fixes

* Fixed annotated PDF download producing corrupted files in lesson wide mode
* Fixed zen inbox always fetching messages for tutor ID 0 instead of actual user
* Fixed `/` key being intercepted when typing in non-command-bar inputs
* Fixed focused section not updating when inbox message is expanded
* Fixed reaction button styling for own replies in zen inbox

## [2.0.21](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.21) (2026-03-09)

### New Features

* **Web Push notifications** — receive OS-level notifications for new inbox messages even when the browser tab is closed, using free browser Push API with VAPID keys (no third-party service cost)
* **Favicon unread badge** — red circle with unread message count overlaid on the browser tab icon, visible app-wide across all pages
* **New message banner** — in-app toast showing sender name and preview when a message arrives for another thread, with click-to-jump and auto-dismiss
* **Connection status indicator** — amber "Reconnecting..." or red "Disconnected" bar when the real-time SSE connection drops
* **Differentiated urgent alerts** — urgent/high priority messages play a distinct two-tone sound and show red-accented notifications

### Improvements

* Dedicated 64x64 favicon for crisp display at small sizes
* Inbox tab title shows unread count: `(3) Inbox - CSM Pro`
* Push subscription auto-syncs once per browser session to recover from backend purges

### Bug Fixes

* Fixed zen annotation strokes disappearing after drawing
* Fixed zen lesson PDF viewer race conditions during exercise switching
* Fixed hi-res re-render overwriting pages on exercise switch
* Fixed cached blob URL revocation causing broken images during student switch
* Fixed zen exercise assign showing stale data when switching CW/HW or students
* Fixed zen mode known issues: Escape handling, timer cleanup, and exit dialog

## [2.0.20](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.20) (2026-03-08)

### New Features

* **Shared content panel in chat** — browse all media, files, links, audio, math, and graphs shared in a conversation thread with jump-to-message, sender filter, and tab navigation
* **Chat quality-of-life** — message copy, reply banner, image zoom, loading skeleton, and accessibility improvements
* **Zen lesson mode** — per-session and lesson-wide PDF viewing with keyboard-driven exercise navigation, page browsing, zoom, answer key toggle, open, and print
* **Zen lesson mode exercise editing** — inline CW/HW assignment with pre-populated existing exercises, direct path input, search/browse, multi-select, and editable page ranges
* **Zen lesson mode access everywhere** — `[L]esson` button on time slot headers and session detail panel across zen dashboard and sessions page. `L` opens single-student lesson mode, `Shift+L` opens lesson-wide mode
* **Zen lesson-wide two-digit student keys** — student switcher supports numbers 1–99 with buffered input
* **Zen courseware assign redesign** — tabbed date picker showing session details for clearer context when assigning exercises

### Improvements

* Shared lesson state hook eliminates duplication between single and wide lesson modes
* Shared week date helpers deduplicated across pages
* Dashboard session limit raised from 100 to 2000

### Bug Fixes

* Fixed PDF viewer crash during hi-res canvas re-render
* Fixed trending courseware showing wrong relative time
* Fixed checkbox column wrapping on zen sessions page
* Fixed incoming message timestamp overlapping toolbar
* Fixed reply-to-message linking broken by HTML sanitization stripping quote attributes
* Fixed nested quote clutter in threaded replies
* Fixed reply editor expanding beyond viewport
* Fixed inbox thread pane UX issues with lightbox, scroll memory, and interactions
* Fixed session_log debug writes failing on generated columns

### Known Issues

* **Lesson mode Escape handling** — when editing CW/HW exercises, pressing Escape may close the entire lesson mode instead of just the assignment panel
* **Sessions page missing navigation shortcuts** — day view lacks shortcuts like `gg` (jump to first) that exist on the dashboard
* **Session count ignores filters** — the completed/total count does not update when status or tutor filters are applied
* **Filtered list navigation broken** — cursor up/down navigates the full list instead of only visible filtered sessions
* **Lesson mode feature gaps** — annotation tools, bulk CW/HW download, and other main app lesson features are not yet available in zen lesson mode

## [2.0.19](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.19) (2026-03-07)

### New Features

* **Zen courseware page** — new courseware tab in zen mode with browse, search, and assignment capabilities
* **Zen trending podium** — redesigned zen courseware trending section as a medal ceremony podium with sparkle animation and stats labels

### Bug Fixes

* Fixed sending messages with geometry diagrams failing due to MySQL TEXT column size limit (64KB) — upgraded to MEDIUMTEXT (16MB)
* Fixed PDF preview failing for students with Chinese names — stamp overlay now supports CJK characters
* Fixed PDF preview occasionally showing "Failed to process PDF" despite the file being available — added auto-retry and better error handling
* Fixed zen trending podium filename overflow and alignment across all columns
* Fixed zen courseware page height causing site-level scrollbar

## [2.0.18](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.18) (2026-03-06)

### New Features

* **Lesson-wide mode** — new multi-student lesson view accessible from the time slot header. Aggregates all students in a time slot into a single view with by-student and by-file sidebar modes, student switcher bar for shared exercises, per-exercise print buttons, and full annotation support
* **Bulk print dropdown** — added CW/HW bulk print and download buttons to lesson-wide mode header for quick access
* **Copy make-up message** — new "Msg" action button on make-up sessions generates a bilingual (中文/English) parent notification message with editable modal, language toggle, and one-tap copy. On mobile, copies directly to clipboard with visual feedback
* **Dashboard lesson button** — added lesson-wide mode button to TodaySessionsCard time slot headers for quick access from the dashboard

### Bug Fixes

* Fixed bulk CW/HW download and print not inserting blank pages for double-sided printing — each student's pages now start on a new front page when printed duplex
* Improved lesson mode header responsiveness on mobile — compact padding, smaller buttons, and floating sidebar toggle for lesson-wide mode

## [2.0.17](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.17) (2026-03-06)

### New Features

* **Exercise history panel** — side panel in exercise modal showing past exercises for each student, with duplicate detection warnings when assigning previously-used exercises
* **"All" proposals tab** — admin and super admin users can now see all proposals across tutors in the proposals view
* **Proposals loading skeletons** — replaced spinner with shimmer skeleton cards matching the proposal card layout
* **Document editor list improvements** — nested list style cycling (1→a→i for ordered, disc→circle→square for bullets), task/checklist support with toolbar button and `Ctrl+Shift+9` shortcut, arbitrary start number input rule (e.g. type `3. ` to start at 3), start number dropdown on toolbar, right-click context menu for ordered lists (restart numbering, set value, convert types), and plain text paste detection for list patterns
* **Zen mode view toggle & impersonation** — added view mode toggle (My View/Center View) and role impersonation support to zen mode

### Bug Fixes

* Fixed sidebar view switching (My View → Center View) not updating the session page tutor filter on first click
* Fixed "For you" badge incorrectly showing on proposals in the All tab when the admin is neither proposer nor target
* Improved visual distinction between Book/Propose modes in makeup modal — color-coded toggle (green for Book, blue for Propose) with accent border
* Fixed inbox showing message threads not belonging to the current user
* Fixed leave record button always pointing to super admin's link instead of the current user's
* Fixed zen mode column overflow with wider theme fonts
* Removed confusing `!=alerts` hint from zen header
* Restricted Add Student and New Enrollment buttons to admin users only
* Fixed lesson mode answer viewer not respecting custom page ranges — now correctly handles complex page selections (e.g., "1,3,5-7")
* Fixed lesson mode PDF viewer header showing "p3-6" instead of "p3,6" for non-contiguous pages
* Fixed lesson mode PDF viewer "Fit to width" button using a fullscreen-style icon — now uses a horizontal expand icon that better conveys its purpose
* Fixed sessions list time slot chevron icons using confusing tree-view convention — now uses standard accordion pattern (up=collapse, down=expand)

## [2.0.16](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.16) (2026-03-06)

### New Features

* **Zen enrollments** — added inline enrollment detail within zen student view
* **Zen student detail** — expanded to 7 tabs with full feature parity, copy lesson dates, and makeup proposal indicators

### Improvements

* Removed standalone zen enrollments page to match main app structure

### Bug Fixes

* Fixed profile pictures not saving — widened `profile_picture` column from VARCHAR(500) to VARCHAR(2048) to accommodate Google profile picture URLs
* Fixed exercise modal not allowing deletion of all exercises of a type
* Fixed emoji picker appearing beneath the feedback modal
* Fixed makeup session appearing on wrong date in sessions list
* Fixed document editor tab indents not deletable with Backspace — now reduces indent level instead of merging blocks
* Fixed document editor numbered list auto-format being too aggressive — now only triggers on "1. " instead of any number
* Fixed inability to cancel makeup sessions rescheduled to a different tutor — original tutor now also has cancel permission

## [2.0.15](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.15) (2026-03-05)

### New Features

* **Zen mode pages** — added Students, Sessions, Revenue, and Courseware pages with full keyboard navigation
* **Zen sessions week/day views** — redesigned with week summary + day detail layout, bulk-aware quick mark with confirmation dialog
* **Shared zen components** — extracted ZenSpinner and ZenProgressBar for consistent loading states across all zen pages

### Improvements

* Deduplicated zen mark handlers, shared utilities, session sorting, date formatters, and enrollment utilities
* Context-aware nav hints in zen session list (bulk vs default mode)
* Standardized zen divider widths and empty state punctuation
* Fixed zen header shortcut hints (Shift+T, Shift+P) and notification links

### Bug Fixes

* Fixed bulk confirm payment not decrementing student coupon count when enrollment has a coupon discount
* Fixed renewals page bulk actions only processing the last selected item when items were selected across different search queries
* Fixed zen revenue page infinite loading for admin center-view by including tutor loading state
* Fixed zen activity feed cursor color and outline shift on focus
* Fixed dashboard cards overflowing on narrow mobile screens
* Fixed SWR server component build errors in sessionSorting and callMarkApi

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
