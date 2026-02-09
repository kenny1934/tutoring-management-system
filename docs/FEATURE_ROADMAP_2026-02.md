# Feature Roadmap: Tutoring Management System

> **Brainstorm date:** February 9, 2026
>
> **Method:** 6 AI-simulated stakeholder perspectives (Tutor, Parent, Center Admin, Business Owner, Technical Lead, Product Manager) independently brainstormed 77 features, then a "council discussion" distilled them into 39 prioritized items across 6 phases.

---

## Council Discussion: Key Themes & Tensions

### Where All Perspectives Converge

1. **Parent-facing transparency** was the #1 theme across non-technical stakeholders. Tutors want less "how is my child doing?" WeChat back-and-forth. Parents want visibility into a black box. Admins want fewer inquiries. The Business Owner sees it as a retention lever. The PM sees it as a differentiator.

2. **WeCom automation pipeline** appeared independently in 5 of 6 perspectives: automated fee reminders (Admin), attendance notifications (Parent), daily ops digest (Admin), escalation workflows (PM), and renewal reminders (Owner). The infrastructure already exists (webhooks, fee messages, attendance events) — the pieces just aren't connected.

3. **Analytics & insights** converged from all angles: tutors want student progress snapshots, owners want revenue forecasting and retention funnels, admins want compliance dashboards, and the PM wants learning analytics. The data is already collected — it's just not surfaced as insights.

4. **Mobile-first daily workflows** came from both Tutor (batch attendance, voice notes) and PM (swipe-to-mark, gesture controls). The most frequent action (attendance marking) has the most friction on mobile.

### Key Tensions Resolved

| Tension | Resolution |
|---------|------------|
| Tech Lead wants staging env + tests before new features vs. PM wants features fast | Compromise: invest 1 sprint in infra (staging, tests for critical paths), then alternate feature/stability sprints |
| Parent Portal requires new auth system vs. keep scope small | Start with token-based read-only links (no login), evolve to OTP later |
| AI features (session notes, schedule suggestions) vs. keep it simple | Defer AI to Phase 6; the data foundation needs to be solid first |
| Multi-language (i18n) vs. English-first | Defer to Phase 6; current users are functional in English; Chinese fee messages already work |

---

## Distilled Roadmap: 6 Phases

### Phase 1: Foundation & Quick Wins
*Goal: Strengthen the platform and ship high-impact, low-effort improvements*

| # | Feature | Origin | Effort | Impact |
|---|---------|--------|--------|--------|
| 1.1 | **Daily Ops Digest via WeCom** — Scheduled morning message to admin group: today's session count, unchecked attendance, expiring renewals, pending extensions, overdue payments | Admin, PM | M | HIGH |
| 1.2 | **Automated Renewal Fee Reminders** — When enrollment reaches N days before expiry, auto-send fee message via WeCom webhook and update `fee_message_sent` flag | Admin, Owner, PM | M | HIGH |
| 1.3 | **Quick Attendance Mode** — Dedicated mobile view listing today's sessions with one-tap Attended/No Show buttons and inline performance rating | Tutor, PM | M | HIGH |
| 1.4 | **Session Prep View ("My Day")** — Consolidated view per upcoming session: last session's exercises, pending homework to check, performance trend, upcoming tests | Tutor | M | HIGH |
| 1.5 | **Attendance Reminder Escalation** — Auto-send WeCom nudge to tutor after 24h unmarked, supervisor after 48h, admin after 72h | Admin, PM | S | MEDIUM |
| 1.6 | **Parent Contact Quick-Log from Session** — One-tap "Log parent contact" button on session detail, pre-filled with student/date/In-Person | Tutor | S | MEDIUM |

### Phase 2: Parent Transparency
*Goal: Give parents visibility — the single most requested capability across stakeholders*

| # | Feature | Origin | Effort | Impact |
|---|---------|--------|--------|--------|
| 2.1 | **Parent Portal (Read-Only)** — Token-based URL (no login) showing: upcoming sessions, attendance history, payment status, homework assigned. New `/parent/[token]` route group with lightweight API endpoints scoped to one student | Parent, Tutor, Owner, PM | L | CRITICAL |
| 2.2 | **Automated Attendance Notifications** — WeCom message to parent when attendance is marked (Attended or No Show) | Parent, PM | M | HIGH |
| 2.3 | **Schedule Change Notifications** — Auto-notify parent via WeCom when session is rescheduled, makeup booked, or holiday cancellation occurs | Parent | M | HIGH |
| 2.4 | **Monthly Progress Report** — Auto-generated summary: sessions attended vs scheduled, performance trend, homework completion rate, topics covered, upcoming tests. Viewable on portal + optionally sent via WeCom | Parent, Tutor, Owner | L | HIGH |
| 2.5 | **Fee Payment Confirmation** — When admin marks payment as received, auto-send receipt/confirmation to parent via WeCom | Parent | S | MEDIUM |

### Phase 3: Business Intelligence
*Goal: Transform collected data into strategic decision-making tools*

| # | Feature | Origin | Effort | Impact |
|---|---------|--------|--------|--------|
| 3.1 | **Revenue Forecasting Dashboard** — Project next month/quarter revenue based on active enrollments, renewal rates, and expiry schedule. Best/expected/worst scenarios | Owner | M | HIGH |
| 3.2 | **Student Retention Funnel** — Lifecycle tracking: Trial > Conversion > 1st Renewal > 2nd Renewal > ... > Termination. Conversion rates at each stage, lifetime value per student | Owner, PM | L | HIGH |
| 3.3 | **Trial-to-Enrollment Conversion Dashboard** — Conversion rate, avg days to convert, conversion by tutor, trends over time | Owner, PM | M | HIGH |
| 3.4 | **Tutor Performance Scorecard** — Composite view: student retention rate, avg performance ratings, homework check rate, parent contact coverage, attendance marking timeliness, revenue | Owner, Admin | M | HIGH |
| 3.5 | **Capacity Utilization Report** — Slot fill rate by time/location, peak vs off-peak, idle slot identification | Owner, PM | M | HIGH |
| 3.6 | **Student Engagement Alerts** — Auto-flag: 3 consecutive low ratings, repeated no-shows, homework never completed, approaching expiry without renewal. Surface on dashboard + student profile | Tutor, Admin | M | MEDIUM |
| 3.7 | **Multi-Center Comparison** — Side-by-side metrics (revenue, retention, capacity, sessions) across MSA/MSB | Owner | S | MEDIUM |

### Phase 4: Workflow Automation & Polish
*Goal: Reduce admin burden and add sophistication*

| # | Feature | Origin | Effort | Impact |
|---|---------|--------|--------|--------|
| 4.1 | **Tutor Substitution Workflow** — When tutor is absent, batch-reassign all their sessions for a date range to a substitute in one flow | Admin | M | HIGH |
| 4.2 | **Homework Tracking Nudges** — Banner on session detail: "2 homework items from last session need checking" with one-click to check interface | Tutor, PM | S | MEDIUM |
| 4.3 | **Cross-Tutor Handover Card** — Auto-shown when a tutor opens a session for a student they don't normally teach: recent topics, homework status, parent concerns, performance trend | Tutor | M | HIGH |
| 4.4 | **Extension Request Auto-Guidance** — Populate `admin_guidance` field with: attendance rate, historical extensions, pattern analysis, recommendation | Admin | M | MEDIUM |
| 4.5 | **Bulk Fee Message Generation** — Select multiple expiring enrollments on renewals page, generate all fee messages, copy/send in batch | Admin | S | MEDIUM |
| 4.6 | **Overdue Payment Escalation** — Tiered auto-escalation: 7d > WeCom flag, 14d > 2nd reminder, 21d > suspension alert | Admin, Owner | M | MEDIUM |
| 4.7 | **Parent Communication Templates** — Pre-built templates for common scenarios (progress update, concern, renewal) with auto-populated student data | PM, Tutor | M | MEDIUM |
| 4.8 | **Planned Leave Calendar for Tutors** — Submit leave dates, auto-highlight affected sessions, prompt substitution workflow | Admin | M | MEDIUM |

### Phase 5: Technical Health
*Goal: Pay down critical tech debt to sustain feature velocity*

| # | Feature | Origin | Effort | Impact |
|---|---------|--------|--------|--------|
| 5.1 | **Staging Environment** — Separate Cloud Run + Cloud SQL instance with synthetic data, deployed on PR merge to `staging` branch | Tech Lead | L | HIGH |
| 5.2 | **Frontend Test Coverage** — Component tests for: enrollment creation, attendance marking, makeup scheduling, proposal workflow. Target 50%+ coverage on critical paths | Tech Lead | L | HIGH |
| 5.3 | **Structured Logging + Cloud Monitoring** — JSON structured logging, ship to Cloud Logging, add request latency/error rate metrics, basic alerting | Tech Lead | M | HIGH |
| 5.4 | **API Client Codegen** — Auto-generate TypeScript types + API client from FastAPI OpenAPI spec. Eliminate type drift between frontend/backend | Tech Lead | M | MEDIUM |
| 5.5 | **Large File Decomposition** — Break down ZenExerciseAssign (2728 lines), ScheduleMakeupModal (2410 lines), enrollments.py (2637 lines) into subcomponents/service layers | Tech Lead | L | MEDIUM |
| 5.6 | **Automated Migration Runner** — Track applied migrations, auto-run on deploy | Tech Lead | M | MEDIUM |
| 5.7 | **Secret Management** — Migrate secrets to Google Cloud Secret Manager | Tech Lead | S | MEDIUM |

### Phase 6: Future Horizons
*Goal: Differentiating capabilities for long-term competitive advantage*

| # | Feature | Origin | Effort | Impact |
|---|---------|--------|--------|--------|
| 6.1 | **AI Session Notes & Topic Suggestions** — LLM-generated session summaries from exercises/homework/ratings; next-session topic recommendations based on curriculum view | PM | L | HIGH |
| 6.2 | **Offline-Capable Session Mode (PWA)** — Service worker for core attendance workflow; sync when online | Tutor, PM | L | MEDIUM |
| 6.3 | **Multi-Language UI (i18n)** — Traditional Chinese + English; leverage Next.js i18n | PM | L | MEDIUM |
| 6.4 | **Student Progress Report Card (PDF)** — Exportable PDF per student for parent meetings: attendance, ratings, topics, homework, test alignment | Tutor, Parent | M | MEDIUM |
| 6.5 | **Referral Tracking System** — Track how students discover the center, link referrals to outcomes | Owner | M | MEDIUM |
| 6.6 | **Automated Monthly Business Report** — PDF summary: revenue vs prior month, new/lost students, renewal rate, tutor rankings, capacity trends | Owner | M | MEDIUM |
| 6.7 | **WebSocket Real-Time Notifications** — Replace polling for messages, proposals, extensions with push | Tech Lead | L | LOW |
| 6.8 | **Pricing Sensitivity Analysis** — Model fee change impact based on historical churn patterns | Owner | M | LOW |

---

## Effort Legend
- **S** = Small (1-3 days)
- **M** = Medium (3-7 days)
- **L** = Large (1-3 weeks)

## Recommended Execution Order

The phases are roughly sequential, but not strictly so. Recommended interleaving:

1. **Start with Phase 1** (Quick Wins) — immediate value, builds WeCom automation pattern reused everywhere
2. **Phase 5.1-5.3** (Staging + Tests + Monitoring) — do early to de-risk all subsequent work
3. **Phase 2** (Parent Portal) — highest cross-stakeholder demand
4. **Phase 3** (Business Intelligence) — unlocks strategic decision-making
5. **Phase 4 + 5.4-5.7** (Automation + remaining tech debt) — interleave as needed
6. **Phase 6** (Horizons) — when core platform is stable and data-rich

---

## Features Considered but Deprioritized

These appeared in brainstorming but were cut during council discussion:

| Feature | Reason Deprioritized |
|---------|---------------------|
| Voice-to-text session notes | Browser SpeechRecognition is unreliable in Cantonese; defer to Phase 6 AI approach |
| Redis cache layer | Current scale doesn't justify operational complexity; revisit if response times degrade |
| RBAC granularity enhancement | Current 4-role system works; over-engineering risk |
| Gamification/leaderboards | Fun but low business impact; could backfire with competitive dynamics |
| Smart schedule conflict resolution (AI) | Existing conflict detection + manual resolution is sufficient |
| Makeup slot templates | Nice-to-have but smart suggestions already cover 80% of the need |
| Recurring homework templates | Courseware popularity already surfaces common materials |
| Parent two-way messaging | Too complex for initial portal; start read-only, evolve later |
| Database backup drill automation | Important but handled at GCP infrastructure level |
| Bundle size optimization/Lighthouse CI | Good practice but not a user-facing priority |
