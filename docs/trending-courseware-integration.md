# Trending Courseware Integration Plan

**Status**: Not yet implemented
**Reference**: This plan integrates popular courseware suggestions into the Shelv/Exercise modal workflow.

---

## Goal

Show popular courseware suggestions in Shelv/Exercise modal workflow, **pre-filtered by the current session's school and grade**, so tutors don't have to visit the separate ranking page.

---

## Data Available

**API Endpoint**: `GET /api/courseware/popularity?time_range=recent&exercise_type=&grade=&school=`

**Response Structure**:
```typescript
interface CoursewarePopularity {
  filename: string;              // Normalized filename (no path/extension)
  normalized_paths: string;      // Comma-separated full paths
  used_by: string;               // "F2C@School1, F3E@School2"
  assignment_count: number;      // Times assigned in last 14 days
  unique_student_count: number;  // Distinct students
  earliest_use: string | null;
  latest_use: string | null;
}
```

**Existing Hook**: `useCoursewarePopularity(timeRange, exerciseType?, grade?, school?)`

**Session Context Available** (from ExerciseModal):
- `session.grade` - e.g., 'F1', 'F2', 'F3'
- `session.school` - e.g., 'SchoolA', 'SchoolB'
- `exerciseType` - 'CW' or 'HW'

---

## Integration Design

### Add "Trending" Section to Shelv Empty State

When Shelv modal opens with empty query, show TWO sections:
1. **Trending** (NEW) - top 5-10 from courseware popularity API, pre-filtered
2. **Recent** (already implemented) - from localStorage

**UI Mockup**:
```
+-------------------------------------------+
| Search for documents...                   |
+-------------------------------------------+
| Trending for F2 @ SchoolA (Last 14d)      |
| +---------------------------------------+ |
| | [flame] Algebra Practice Sheet  (47x) | |
| | [flame] Word Problems Ch5       (38x) | |
| |         Geometry Review         (25x) | |
| +---------------------------------------+ |
|                                           |
| Recently Used                             |
| +---------------------------------------+ |
| |    Doc I used yesterday               | |
| |    Another recent doc                 | |
| +---------------------------------------+ |
+-------------------------------------------+
```

**Filtering Behavior**:
- **Exercise type**: Maps CW → 'Classwork', HW → 'Homework' for API filter
- **Grade**: Pass `session.grade` (e.g., 'F2') - note: lang_stream (C/E) is not used
- **School**: Pass `session.school` for school-specific trending
- Clicking a trending item uses first path from `normalized_paths`
- "Flame" icon for top 3 items

---

## Files to Modify

### 1. `webapp/frontend/components/ui/paperless-search-modal.tsx`
- Import `useCoursewarePopularity` hook from `@/lib/hooks`
- Import `CoursewarePopularity` type from `@/types`
- Add new props: `exerciseType`, `studentGrade`, `school`
- Fetch trending when modal opens (filtered by all three)
- Add "Trending" section above "Recent" in empty state
- Handle selection (extract first path from `normalized_paths`)

### 2. `webapp/frontend/components/sessions/ExerciseModal.tsx`
- Pass `exerciseType`, `session.grade`, and `session.school` to PaperlessSearchModal

---

## Implementation Details

### New Props for PaperlessSearchModal
```typescript
interface PaperlessSearchModalProps {
  // ... existing props
  exerciseType?: 'CW' | 'HW';   // Filter trending by type
  studentGrade?: string;        // Filter by grade (e.g., 'F2')
  school?: string;              // Filter by school
}
```

### Trending Fetch Logic
```tsx
const { data: trending, isLoading: trendingLoading } = useCoursewarePopularity(
  'recent',
  exerciseType === 'CW' ? 'Classwork' : exerciseType === 'HW' ? 'Homework' : undefined,
  studentGrade,   // e.g., 'F2'
  school          // e.g., 'SchoolA'
);
const topTrending = trending?.slice(0, 10) || [];
```

### Trending Section UI
```tsx
{/* Trending section - shown when no search query */}
{!searchQuery && topTrending.length > 0 && (
  <div className="mb-4">
    <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
      <TrendingUp className="h-3 w-3" />
      Trending {studentGrade && `for ${studentGrade}`} {school && `@ ${school}`}
      <span className="text-gray-400">(Last 14 days)</span>
    </div>
    <div className="space-y-1">
      {topTrending.map((item, index) => (
        <button
          key={item.filename}
          onClick={() => handleSelectTrending(item)}
          className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
        >
          {index < 3 && <Flame className="h-3 w-3 text-orange-500" />}
          <span className="flex-1 truncate">{item.filename}</span>
          <span className="text-xs text-gray-400">{item.assignment_count}x</span>
        </button>
      ))}
    </div>
  </div>
)}
```

### Selection Handler
```tsx
const handleSelectTrending = (item: CoursewarePopularity) => {
  // Get first path from comma-separated list
  const path = item.normalized_paths.split(',')[0]?.trim();
  if (path) {
    onSelect(path);
    onClose();
  }
};
```

### ExerciseModal Update
```tsx
<PaperlessSearchModal
  isOpen={paperlessSearchOpen}
  onClose={() => {
    setPaperlessSearchOpen(false);
    setSearchingForIndex(null);
  }}
  onSelect={handlePaperlessSelected}
  multiSelect
  onMultiSelect={handlePaperlessMultiSelect}
  // NEW: Pass session context for filtered trending
  exerciseType={exerciseType}
  studentGrade={session.grade}
  school={session.school}
/>
```

---

## Edge Cases

1. **No trending data for filters** → Just show Recent section (graceful fallback)
2. **Missing session context** → Show unfiltered trending or skip section
3. **Trending item has multiple paths** → Use first path
4. **Path doesn't exist** → User can still search Shelv manually

---

## Future Enhancements

1. **Trending badge in search results** - Mark Paperless results that match trending
2. **Personal trending** - "Your most used" based on tutor's own history
3. **Fallback to broader filters** - If no results for school+grade, try grade-only
