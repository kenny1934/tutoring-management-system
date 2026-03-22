# Post-rebase fixes

## Issues found by verification agents

### 1. CRITICAL: Missing models from origin/main
`webapp/backend/models.py` is missing 3 model classes that exist on origin/main:
- `ReportShare`
- `SavedReport`
- `StudentRadarConfig`

**Fix:** Re-apply the diff from origin/main for models.py (the models were in the truncated section).

### 2. CRITICAL: AuthGuard.tsx corrupted
Duplicate `const isPublicRoute` variable from bad merge resolution.

**Fix:** Reset to origin/main version, then re-apply the `/share` route addition.

### 3. CRITICAL: LayoutShell.tsx corrupted
Duplicate conditional statement for zen/summer routes.

**Fix:** Reset to origin/main version, then re-apply the `/summer` route addition.

### 4. Missing: Student progress APIs from origin/main
`api.ts` and `types/index.ts` are missing `studentProgressAPI`, `reportSharesAPI`, `savedReportsAPI` and their types.

**Fix:** Already handled — these were in the diff that was applied. Need to verify they're actually present.

## Fix approach
For each broken file, get origin/main version and re-apply the branch diff (same approach that worked for models/schemas/api/types).
