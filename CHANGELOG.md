# Changelog

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

* Sidebar reorganized into 3 sections: primary mailboxes, smart views (Starred, Mentions, Send Later, Snoozed), and collapsible Tags
* Rich interactions: quote-reply, message forwarding, swipe actions, keyboard shortcuts
* Paste/drag image uploads with parallel processing
* Search highlighting across thread list and message content
* Draft auto-save with thread list preview indicator
* Dark mode polish across all new components
* Performance: memoized components, stale-while-revalidate for category navigation

### Bug Fixes

* Unread counts now exclude scheduled (unsent) messages
* Fixed inbox loading skeleton getting stuck when navigating between categories
* Fixed timezone mismatch in snooze reminder background task (use HK time consistently)
* Added row-level locking to prevent duplicate scheduled message delivery
* Added unique constraint on thread pins to prevent duplicates

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
