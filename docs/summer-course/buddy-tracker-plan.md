# Primary Branch Buddy Tracker — Design & Implementation Plan

## Context

Primary branches operate on pen-and-paper for summer course registrations. They have a buddy discount scheme (groups of 2+) but tracking who's paired with whom has been a manual pain point. Additionally, cross-branch sibling buddy groups (e.g., 2 secondary + 1 primary sibling) are an unsolved edge case in the existing secondary system.

This feature builds a lightweight, PIN-gated self-service page where primary branch staff can track buddy group registrations, and connects it to the existing secondary buddy code system for cross-branch sibling support.

## Business Rules

### Buddy Group Scoping
- Primary buddy groups are **per-branch by default** — each branch sees only its own entries
- **Exception: siblings** — a buddy code can span branches, but only when members are confirmed siblings
- Cross-branch joins require explicit staff confirmation ("this student is a sibling")

### Discount Thresholds (applied per-branch, not per-group)
- **Primary branches**: 2+ members in a group
- **Secondary branches**: 3+ members in a group
- Group size = total members across all branches (everyone counts)

### Cross-Branch Scenarios
| Scenario | Allowed? | Notes |
|----------|----------|-------|
| Two friends, same primary branch | Yes | Default case |
| Two siblings, different primary branches | Yes | Staff confirms sibling |
| Primary sibling + secondary student(s) | Yes | Staff confirms sibling; counts toward secondary's threshold too |
| Two friends, different primary branches (not siblings) | No | System blocks — cross-branch requires sibling confirmation |

---

## Architecture

### Database Changes

**Alter `summer_buddy_groups`:**
- Make `config_id` nullable (primary-created groups don't have a summer course config)
- Add `year` column — groups are scoped by year, not by config

**New table `summer_buddy_members`:**

| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | Auto-increment |
| buddy_group_id | INT FK | → summer_buddy_groups(id), CASCADE delete |
| student_id | VARCHAR(50) | Branch-specific student ID (e.g., "MAC1234") |
| student_name_en | VARCHAR(255) | Required |
| student_name_zh | VARCHAR(255) | Optional |
| parent_phone | VARCHAR(50) | Optional |
| source_branch | VARCHAR(10) | Which primary branch added this entry |
| is_sibling | BOOLEAN | True if cross-branch join confirmed as sibling |
| year | INT | Year scoping |
| created_at | TIMESTAMP | Auto |
| updated_at | TIMESTAMP | Auto on update |

Secondary students continue linking via `summer_applications.buddy_group_id` (no change). Group size counts both tables.

### Backend API

New router at `/buddy-tracker/` with PIN-based auth (same pattern as prospect page).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/buddy-tracker/verify-pin` | PIN authentication |
| GET | `/buddy-tracker/members?branch=&year=` | List branch members with group info |
| POST | `/buddy-tracker/members` | Add student (optionally with buddy code) |
| PATCH | `/buddy-tracker/members/{id}?branch=` | Edit student details |
| DELETE | `/buddy-tracker/members/{id}?branch=` | Delete student |
| GET | `/buddy-tracker/groups/{code}` | Lookup group by code (preview before joining) |

**Add student logic:**
- No buddy code → create new group, generate code, add member
- Buddy code provided, same branch → add to existing group
- Buddy code provided, cross-branch → require `is_sibling=true`, else reject with 400

**Secondary system updates:**
- Buddy code validation on application form must accept primary-created groups (config_id IS NULL, matched by year)
- Group size counting must include `summer_buddy_members` alongside `summer_applications`

### Frontend Page

Single page at `/summer/buddy` with three states:

1. **Branch Selection** — grid of branch tiles
2. **PIN Gate** — password input with rate limit handling
3. **Main Tracker View**:
   - Header bar with branch badge, year, summary stats
   - Add Student form (student ID, names, phone, buddy code generate/lookup)
   - Cross-branch sibling confirmation prompt when joining another branch's group
   - Responsive table (desktop) / card list (mobile) of all entries
   - Expandable row detail showing full group membership across branches
   - Inline edit and delete with confirmation
   - Click-to-copy buddy codes

**Design:** White/red/black color scheme (distinct from the warm oak/cream palette used in other summer pages). Custom CSS variables via `.buddy-theme` class.

### Admin Visibility

Secondary admin detail modal updated to also display primary `summer_buddy_members` in buddy group member lists, with "Primary" badge + branch label.

---

## Implementation Order

1. Database migration
2. Backend models + schemas
3. Backend router + wiring (main.py, rate limiter)
4. Secondary system updates (buddy code validation, group size counting)
5. Frontend types + API client
6. Frontend CSS theme + layout changes
7. Frontend page
8. Admin visibility updates

## URL & Access

- **Path**: `/summer/buddy` (under existing summer page umbrella)
- **Auth**: PIN-based per branch (env var per branch, same pattern as prospect page)
- **Domain**: Can be pointed to any custom domain later via DNS — zero code changes needed
