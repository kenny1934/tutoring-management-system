# Bulk Exercise Assignment Feature

## Overview
Enables tutors to assign the same classwork or homework to multiple sessions simultaneously using AppSheet's bulk selection and [_INPUT] functionality.

## Database Changes

### Staging Columns Added to session_log:
- `bulk_pdf_name` - Temporary storage for PDF name
- `bulk_page_start` - Temporary storage for starting page number
- `bulk_page_end` - Temporary storage for ending page number  
- `bulk_exercise_remarks` - Temporary storage for exercise remarks
- `bulk_exercise_type` - Indicates 'Classwork' or 'Homework'

## AppSheet Implementation

### Two Separate Actions for Better UX:

#### Action 1: "ClassWork"
**Type:** Grouped - Execute a sequence of actions
**Allow bulk selection:** Yes

**Sub-Action 1: "Capture CW Details"**
- Type: Data - Set column values in session_log
- Set columns:
  - `bulk_pdf_name` = `[_INPUT].[PDF Name (e.g., Math_Book, Worksheet_Set_A)]`
  - `bulk_page_start` = `[_INPUT].[Start Page (leave blank for whole PDF)]` 
  - `bulk_page_end` = `[_INPUT].[End Page (leave blank if single page)]`
  - `bulk_exercise_remarks` = `[_INPUT].[Remarks/Instructions]`
  - `bulk_exercise_type` = `"Classwork"`

**Sub-Action 2: "Create CW Records"**
- Type: Data - Add row to session_exercises
- Condition: `ISNOTBLANK([bulk_pdf_name])`
- Set values:
  - `session_id` = `[_THISROW].[id]`
  - `exercise_type` = `[_THISROW].[bulk_exercise_type]`
  - `pdf_name` = `[_THISROW].[bulk_pdf_name]`
  - `page_start` = `[_THISROW].[bulk_page_start]`
  - `page_end` = `[_THISROW].[bulk_page_end]`
  - `remarks` = `[_THISROW].[bulk_exercise_remarks]`
  - `created_by` = `USEREMAIL()`

**Sub-Action 3: "Clear Staging Data"**
- Type: Data - Set column values in session_log
- Set columns:
  - `bulk_pdf_name` = `""`
  - `bulk_page_start` = `""`
  - `bulk_page_end` = `""`
  - `bulk_exercise_remarks` = `""`
  - `bulk_exercise_type` = `""`

#### Action 2: "HomeWork"
**Identical to Classwork action, but:**
- Set `bulk_exercise_type` = `"Homework"`
- Button/action name reflects "Homework"

## User Experience Flow

### Single Session (Current):
1. Open session → Add exercises → Fill form → Save

### Bulk Sessions (New):
1. **Select multiple sessions** (2-10 sessions)
2. **Tap "ClassWork" or "HomeWork" (bulk actions)**
3. **Fill single form** with exercise details:
   - PDF Name: "Geometry_Chapter_1" 
   - Start Page: 5
   - End Page: 12
   - Remarks: "Focus on problem 3-7"
4. **One tap** - creates exercise records for ALL selected sessions

## Benefits

### For Tutors:
- **70-80% time savings** for repetitive assignments
- **Consistent assignments** across similar students
- **No navigation complexity** - stays in bulk mode
- **Error reduction** - single entry, multiple applications

### For Management:
- **Higher exercise tracking compliance** (easier = more usage)
- **Standardization** of common assignments
- **Better analytics** on exercise effectiveness

## Technical Details

### Why Staging Columns:
- AppSheet [_INPUT] only works within same table actions
- Cannot directly add rows to another table with [_INPUT] values
- Staging columns bridge this gap elegantly

### Data Flow:
```
1. [_INPUT] captures data → bulk_* staging columns in session_log
2. Grouped action reads staging data → creates session_exercises records  
3. Cleanup clears staging columns → ready for next use
```

### Complex Page Patterns:
For patterns like "p.1-3, 5, 7":
- Leave page start/end blank
- Use remarks: "p.1-3, 5, 7 - focus on odd problems"
- Maintains current tutor workflow

## Implementation Status
- ✅ Database schema ready
- ✅ Staging columns concept tested
- 🚧 AppSheet actions configuration (in progress)
- ⏳ Production testing with multiple tutors

## Future Enhancements
- **Quick templates** for common exercise sets
- **Copy from previous session** shortcuts  
- **Integration with Teaching Playbook** for curriculum-based suggestions
- **Analytics dashboard** showing most assigned exercises