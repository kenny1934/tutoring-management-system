# Comprehensive Webapp Analysis for Launch Readiness

**Scope**: Full codebase review (excluding zen mode)
**Goal**: Identify bugs, UX issues, and code quality improvements before launch
**Last Updated**: 2026-02-03

---

## Executive Summary

| Area | Before | Current | Target | Key Issues to Fix |
|------|--------|---------|--------|-------------------|
| Frontend Architecture | 7.5/10 | 8.5/10 | 8.5/10 | ~~Error boundaries~~, ~~SWR cache invalidation~~ |
| Backend Architecture | 8/10 | 8/10 | 8.5/10 | Extract services from large routers |
| Security | 7/10 | 7.5/10 | 8.5/10 | ~~Validate impersonation server-side~~ |
| Type Safety | 6.5/10 | 8/10 | 8.5/10 | ~~Separate request/response types~~, ~~enums for statuses~~ |
| Error Handling | 6/10 | 8/10 | 8.5/10 | ~~Centralize error formatting~~, ~~consistent UX~~ |

**Goal: All areas to 8.5+ after this round of fixes**

---

## PHASE 1: COMPLETED ✅

### 1. ✅ React Error Boundaries (Critical)
- Added `PageErrorBoundary` component
- Wrapped app content in Providers.tsx
- Prevents single component errors from crashing entire app

### 2. ✅ Role Impersonation Security (Critical)
- Added centralized `get_effective_role()` helper
- Updated stats.py and students.py to use it
- Backend already validated Super Admin requirement

### 3. ✅ SWR Cache Invalidation (Critical)
- Added `invalidateCaches()` utility function
- Added `useCacheInvalidation()` hook
- Enhanced session cache to refresh related caches
- Fixed `revalidateOnReconnect: true`

### 4. ✅ Centralized Error Formatting (High)
- Added `formatError()` utility in lib/utils.ts
- Added `showError()` helper to ToastContext
- Maps known API errors to user-friendly messages

### 5. ✅ Session Status Enums (High)
- Added `SessionStatus` enum in backend/constants.py
- Added `SessionStatus` const and groupings in frontend/types/index.ts

---

## PHASE 2: COMPLETED ✅

### 6. ✅ Loading/Error States Audit (High)
- Audited: CreateEnrollmentModal, EditSessionModal, ScheduleMakeupModal, AddStudentModal, RecordContactModal
- **Finding**: All key modals already have proper loading states (spinners, disabled buttons, error display)
- No changes needed - modals are well-implemented

### 7. ✅ TypeScript Type Improvements (High)
- Created separate `StudentCreate` vs `Student` types in `types/index.ts`
- Created separate `EnrollmentCreate` vs `Enrollment` types
- Created `SessionUpdate` type for session edits
- Added JSDoc comments documenting when each type is used
- Updated `api.ts` to import from types and re-export for backward compatibility

### 8. ✅ Form Validation Audit (Medium)
- Added required field indicators (`*`) to CreateEnrollmentModal (Student, Tutor, First Lesson Date)
- AddStudentModal and RecordContactModal already have proper required indicators
- EditSessionModal is edit-only (all fields pre-filled) - no indicators needed
- Using native HTML5 validation (no need for react-hook-form for this complexity level)

### 9. ✅ Timezone Handling Audit (Medium)
**Backend Analysis:**
- Date columns (session_date, first_lesson_date) use pure DATE type - no timezone issues
- DateTime columns are mostly naive (no timezone) - minor inconsistency but functionally ok
- `effective_end_date` calculation returns pure DATE - no timezone issues

**Frontend Fixes Applied:**
- Fixed `formatSessionDateTime()` - now uses `+ 'T00:00:00'` suffix
- Fixed `formatDateWithDay()` - now uses `+ 'T00:00:00'` suffix
- Fixed `formatShortDate()` - handles both date-only and datetime strings
- Fixed date parsing in: TrialsQuickLink.tsx, trials/page.tsx, RevisionSlotCard.tsx, EnrollStudentModal.tsx, EditRevisionSlotModal.tsx

**Root cause**: `new Date("2025-01-15")` interprets date as UTC midnight, but `getDay()` returns local timezone. For users west of UTC, this could show wrong weekday. Fix: Always append `'T00:00:00'` to date-only strings.

---

## PHASE 3: IN PROGRESS - Medium Priority

### 10. Backend Tests for Critical Paths
**Impact**: Regressions in complex business logic
**Status**: To do
**Risk Areas**:
- Enrollment date calculations (holiday skipping)
- Session status state machine
- Makeup chain traversal (60-day rule)
**Fix**: Add pytest fixtures for critical paths

### 11. ✅ Session Timeout/Token Refresh
**Impact**: 24-hour tokens are long-lived security risk
**Status**: Done
**Fix Applied**:
- Reduced JWT expiry from 24hr to 4hr sliding window
- Added `/auth/refresh` endpoint for token renewal
- Frontend: Added 401 interceptor with automatic retry after refresh
- Frontend: Added proactive refresh timer in AuthContext

### 12. Complex Router Files Refactoring
**Status**: To do
**Files**:
- `enrollments.py`: 2553 LOC
- `sessions.py`: 2106 LOC
**Fix**: Extract to service classes (EnrollmentService, SessionService)

### 13. ✅ Hook Organization
**Status**: Done
**Pattern**: Some hooks in `/lib/hooks.ts`, others in `/lib/hooks/`
**Fix**: Consolidated hooks under `/lib/hooks/` with re-exports for backward compatibility
- Moved `useWeather`, `useDailyPuzzle`, `useMapSelection`, `useKonamiCode` to `/lib/hooks/`
- Updated index.ts to export all hooks
- Old files now re-export for backward compatibility

### 14. Missing Docstrings on Backend Endpoints
**Status**: To do
**Impact**: Poor OpenAPI documentation
**Fix**: Add descriptions to complex endpoints

### 15. ✅ Rate Limiting on Sensitive Endpoints
**Status**: Done
**Affected**: Auth, debug panel, bulk operations
**Fix Applied**:
- Enhanced rate_limiter.py with IP-based limiting for auth endpoints
- Added rate limits for auth (login: 5/min, callback: 10/min)
- Added rate limits for debug (SQL: 10/min, bulk delete: 5/min, export: 5/5min)
- Added rate limits for bulk operations (exercises: 20/min)

### 16. ✅ Pagination Inconsistency
**Status**: Done
**Issues Found**:
- Inconsistent defaults: Limits range from 20 to 1000 across endpoints
- Inconsistent maximums: Max limits vary from 50 to 2000
**Fix Applied**:
- Standardized to default=50, max=500 across messages.py and courseware.py
- Updated: GET /messages, GET /messages/sent, GET /messages/archived, GET /courseware/popularity

---

## PHASE 4: LOW PRIORITY (Nice to Have)

### 17. Skeleton Loading UI
**Current**: Spinner or "loading..." text
**Improvement**: Skeleton cards during data fetch

### 18. Manual Refresh UI
**Current**: No way for users to force-fetch
**Improvement**: Add refresh buttons to key lists

### 19. Context Consolidation
**Current**: 7+ contexts (Auth, Role, Location, Toast, etc.)
**Improvement**: Consider merging related contexts

### 20. Offline Support
**Current**: No service workers
**Improvement**: Add offline indicators, queue failed requests

### 21. Analytics Integration Points
**Improvement**: Add event tracking hooks for user actions

---

## SPECIFIC BUGS TO INVESTIGATE

Based on code patterns, these areas may have bugs:

1. ✅ **Makeup proposal concurrency** - Multiple proposals can race without locks
   - Fixed with FOR UPDATE pessimistic locks and status re-verification
2. ✅ **Calendar event parsing** - Regex patterns may miss formats
   - Added defensive null/empty checks to `_parse_title()`, `_parse_date()`, `_parse_event()`
   - Added try/except handling for malformed dates
3. ✅ **Enrollment effective_end_date** - Complex calculation, edge cases likely
   - Added 2x buffer for holiday scanning, max iteration guards (500 iterations)
4. ✅ **Null handling in responses** - Some fields return null unexpectedly
   - Audited: Backend already uses `Optional` types and conditional access properly
   - Frontend hooks use conditional keys and null checks correctly
5. ✅ **Google Calendar sync** - Has threading lock but error recovery unclear
   - Added retry logic (3 attempts, exponential backoff) for transient API failures
   - Replaced print() statements with proper logger calls
   - Added /exam-revision/calendar/sync-status endpoint for monitoring

---

## FILES TO REVIEW IN DETAIL

| Priority | File | Reason | Status |
|----------|------|--------|--------|
| ~~Critical~~ | ~~`frontend/lib/api.ts`~~ | ~~SWR mutation patterns, error handling~~ | ✅ Done |
| ~~Critical~~ | ~~`frontend/components/providers/Providers.tsx`~~ | ~~Add error boundary~~ | ✅ Done |
| ~~Critical~~ | ~~`backend/auth/dependencies.py`~~ | ~~Impersonation validation~~ | ✅ Done |
| High | `backend/routers/enrollments.py` | Complex business logic | To do |
| High | `backend/routers/sessions.py` | Status state machine | To do |
| ~~High~~ | ~~`frontend/types/index.ts`~~ | ~~Type definitions cleanup~~ | ✅ Done |
| ~~Medium~~ | ~~`frontend/lib/formatters.ts`~~ | ~~Timezone date handling~~ | ✅ Done |
| ~~Medium~~ | ~~`frontend/components/Providers.tsx`~~ | ~~SWR global config~~ | ✅ Done |
| Medium | `backend/schemas.py` | Validation rules review | To do |

---

## CHANGELOG

### 2026-02-03 - Phase 3 Round 3 Complete
- Standardized pagination: default=50, max=500 across messages.py and courseware.py
- Added retry logic to Google Calendar sync (3 attempts with exponential backoff)
- Replaced print() with proper logger calls in google_calendar_service.py
- Added /exam-revision/calendar/sync-status and /exam-revision/calendar/sync endpoints

### 2026-02-03 - Phase 3 Round 2 Complete (5cdfa74)
- Added pessimistic locking to makeup proposals (FOR UPDATE, status re-verification)
- Added iteration guards to enrollment date calculations (2x buffer, max 500 iterations)
- Implemented 4hr sliding window JWT with token refresh
- Added `/auth/refresh` endpoint
- Added 401 interceptor with retry in frontend api.ts
- Added proactive refresh timer in AuthContext

### 2026-02-03 - Phase 3 Round 1 Complete (346c839)
- Added rate limiting infrastructure for auth, debug, and bulk endpoints
- Consolidated hooks under `/lib/hooks/` with re-exports
- Fixed calendar event parsing with defensive null/empty checks
- Audited null handling - patterns already correct

### 2026-02-03 - Phase 2 Complete (f851ec2)
- Added separate Create/Response TypeScript types (StudentCreate, EnrollmentCreate, SessionUpdate)
- Added required field indicators to CreateEnrollmentModal
- Fixed timezone issues in date formatting (5 files: formatters.ts, TrialsQuickLink.tsx, trials/page.tsx, RevisionSlotCard.tsx, EnrollStudentModal.tsx, EditRevisionSlotModal.tsx)
- Audited loading states - all modals already properly implemented

### 2026-02-03 - Phase 1 Complete (5a3404e)
- Added error boundaries, cache invalidation, error formatting, session status enums
- Fixed SWR revalidateOnReconnect config
