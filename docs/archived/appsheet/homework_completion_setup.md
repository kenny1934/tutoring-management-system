# AppSheet Setup: Homework Completion Tracking

## Prerequisites

1. ✅ Database migration `010_homework_completion.sql` applied
2. ✅ Tables synced in AppSheet:
   - `homework_completion`
   - `homework_to_check` (view)
   - `student_homework_history` (view)

## Step 1: Table Configuration

### Configure `homework_completion` Table

**Navigate to:** Data > Tables > homework_completion

#### Column Settings:
| Column | Type | Show? | Editable? | Notes |
|--------|------|-------|-----------|-------|
| `id` | Number | No | No | Auto-increment |
| `current_session_id` | Ref | Yes | Yes | Reference to session_log (current session) |
| `session_exercise_id` | Ref | Yes | No | Links to specific homework in session_exercises |
| `student_id` | Ref | Yes | Yes | Reference to students |
| `pdf_name` | Text | Yes | No | From session_exercises (denormalized) |
| `page_start` | Number | Yes | No | From session_exercises |
| `page_end` | Number | Yes | No | From session_exercises |
| `exercise_remarks` | LongText | Yes | No | From session_exercises |
| `assigned_date` | Date | Yes | No | When homework was assigned |
| `assigned_by_tutor_id` | Ref | Yes | No | Which tutor assigned this homework |
| `completion_status` | Enum | Yes | Yes | **KEY FIELD** |
| `submitted` | Yes/No | Yes | Yes | Checkbox |
| `tutor_comments` | LongText | Yes | Yes | Optional |
| `checked_by` | Ref | Yes | No | Auto-set to current user |
| `checked_at` | DateTime | Yes | No | Auto-timestamp |

#### Enum Values for `completion_status`:
```
Not Checked
Completed  
Partially Completed
Not Completed
```

#### Valid_If Expressions:

**For `completion_status`:**
```
ENUM("Not Checked", "Completed", "Partially Completed", "Not Completed")
```

**For `current_session_id`:**
```
SELECT(session_log[id], 
  AND([tutor_id] = USEREMAIL(),
      [session_date] = TODAY(),
      [session_status] = "Scheduled"))
```

---

## Step 2: Create Views

### 📝 **View 1: Session Detail with Previous Homework**

**Navigate to:** UX > Views > Edit existing Session Detail View

#### Add Inline View:
| Setting | Value |
|---------|-------|
| **View Name** | `Previous Session Homework` |
| **For This Data** | `homework_to_check` |
| **View Type** | `Table` or `Card` |
| **Show If** | `[current_session_id] = [_THISROW].[id]` |
| **Sort Order** | `pdf_name` |

#### Columns to Show:
- `pdf_name`
- `pages` 
- `assignment_remarks`
- `check_status` (shows Pending/Checked)
- `submitted` (checkbox for quick marking)

---

### 📋 **View 2: Homework Check Dashboard**

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Homework Check Dashboard` |
| **For This Data** | `homework_to_check` |
| **View Type** | `Table` |
| **Show If** | `AND([current_tutor_id] = USEREMAIL(), [check_status] = "Pending")` |
| **Sort Order** | `current_session_date` (newest first) |

#### Columns to Show:
- `student_name`
- `current_session_date`
- `pdf_name`
- `pages`
- `assignment_remarks`
- `homework_assigned_date`
- `assigned_by_tutor`

#### Grouping:
- **Group By**: `current_session_date`
- **Show**: Collapse groups by default

---

### 📋 **View 3: Submitted But Unchecked (AppSheet Slice)**

**Navigate to:** Data > Slices > New Slice

#### Slice Settings:
| Setting | Value |
|---------|-------|
| **Slice Name** | `Submitted But Unchecked` |
| **Table to slice** | `homework_completion` |
| **Row filter condition** | `AND([submitted] = TRUE, [completion_status] = "Not Checked", LOOKUP([checked_by], tutors, id, email_address) = USEREMAIL())` |

#### Create View from Slice:
| Setting | Value |
|---------|-------|
| **View Name** | `Submitted But Unchecked` |
| **For This Data** | `Submitted But Unchecked` (slice) |
| **View Type** | `Table` |
| **Sort Order** | `assigned_date` (oldest first) |

#### Columns to Show:
- `student_id` (show as student name)
- `pdf_name`
- `page_start` and `page_end` (formatted as pages)
- `assigned_date`
- `homework_rating` (star rating)
- `homework_photo` (thumbnail)
- `tutor_comments`

---

### ✏️ **View 4: Quick Homework Check Form**

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Quick Homework Check` |
| **For This Data** | `homework_completion` |
| **View Type** | `Form` |
| **Show If** | `TRUE()` |

#### Form Columns (in order):
1. `current_session_id` (hidden, auto-set from dashboard)
2. `session_exercise_id` (hidden, auto-set from selected homework row)
3. `student_id` (auto-populated from session)
4. `pdf_name` (auto-populated, read-only)
5. `pages` (virtual column showing page_start-page_end, read-only)
6. `completion_status` ⭐ **Main field**
7. `homework_rating` ⭐ **Star rating field**
8. `submitted`
9. `homework_photo` 📸 **Photo upload**
10. `tutor_comments`

#### Column Display Names:
```yaml
completion_status: "How much homework did the student complete?"
homework_rating: "Rate the homework quality (optional)"
submitted: "Did the student submit their homework?"
Related Homework Files: "Attach photos or PDFs (optional)"
tutor_comments: "Comments (optional)"
```

#### Column Type Configuration:
```yaml
homework_rating:
  Type: Enum
  Values: ["⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"]
  Allow blank: Yes

Related Homework Files:
  Type: Ref (List)
  Referenced Table: homework_files
  Display: Inline
  Allow Adds: Yes
```

---

### 📊 **View 5: Student Homework History**

**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Student Homework History` |
| **For This Data** | `student_homework_history` |
| **View Type** | `Table` |
| **Show If** | `[student_id] = [_THISROW].[student_id]` |
| **Sort Order** | `session_date` (newest first) |

#### Columns to Show:
- `status_emoji`
- `session_date`
- `assigned_pdf_name`
- `assigned_pages`
- `completion_status`
- `tutor_comments`

---

## Step 3: Create Actions

### 📱 **Action 1: Create or Update Homework Record**

**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Mark as Submitted` |
| **For a record of this table** | `homework_to_check` |
| **Do this** | `App: go to another view within this app` |
| **Target** | `homework_completion_Form` |

#### Link Configuration:
```yaml
LINKTOFORM("homework_completion_Form",
  "current_session_id", [current_session_id],
  "session_exercise_id", [session_exercise_id],
  "student_id", [student_id],
  "pdf_name", [pdf_name],
  "page_start", EXTRACT([pages], "(\\d+)"),
  "page_end", EXTRACT([pages], "-(\\d+)$"),
  "exercise_remarks", [assignment_remarks],
  "assigned_date", [homework_assigned_date],
  "assigned_by_tutor_id", [assigned_by_tutor_id],
  "submitted", TRUE)
```

#### Show If:
```
[check_status] = "Pending"
```

---

### 🎯 **Action 2: Check Homework Details**

**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Check Homework Details` |
| **For a record of this table** | `homework_completion` |
| **Do this** | `App: go to another view` |
| **Target** | `homework_completion_Form` |

#### Behavior Configuration:
```yaml
Link to view: homework_completion_Form
Link to record: [_THISROW]
```

#### Show If:
```
[submitted] = TRUE
```

---

### ✅ **Action 3: Record Completion** 

**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Record Completion` |
| **For a record of this table** | `homework_completion` |
| **Do this** | `Data: set the values of some columns in this row` |

#### Set these columns:
```yaml
checked_by: USEREMAIL()
checked_at: NOW()
```

#### Show If:
```
[completion_status] <> "Not Checked"
```

---

## Step 4: Create Menu Items

### 📱 **Menu Items**

**Navigate to:** UX > Menu

#### Menu Item 1: Today's Homework Checks
| Setting | Value |
|---------|-------|
| **Display Name** | `📋 Homework Checks` |
| **Go to view** | `Homework Check Dashboard` |
| **Show If** | `USEREMAIL() IN (SELECT(tutors[email_address], TRUE()))` |
| **Order** | 3 |

#### Menu Item 2: Submitted Homework Review
| Setting | Value |
|---------|-------|
| **Display Name** | `🔍 Review Submitted` |
| **Go to view** | `Submitted But Unchecked` |
| **Show If** | `USEREMAIL() IN (SELECT(tutors[email_address], TRUE()))` |
| **Order** | 4 |

---

## Step 5: Workflow Automation

### 🔄 **Auto-populate Assignment Data**

When creating new homework_completion record, auto-fill from session_exercises:

**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `Auto-populate Homework Details` |
| **For a record of this table** | `homework_completion` |
| **Do this** | `Data: set the values of some columns in this row` |

#### Set these columns:
```yaml
pdf_name: 
  LOOKUP([_THISROW].[session_exercise_id], session_exercises, id, pdf_name)

page_start:
  LOOKUP([_THISROW].[session_exercise_id], session_exercises, id, page_start)

page_end:
  LOOKUP([_THISROW].[session_exercise_id], session_exercises, id, page_end)

exercise_remarks:
  LOOKUP([_THISROW].[session_exercise_id], session_exercises, id, remarks)

assigned_date:
  LOOKUP([_THISROW].[session_exercise_id], session_exercises, id, session_date)

assigned_by_tutor_id:
  LOOKUP([_THISROW].[session_exercise_id], session_exercises, id, tutor_id)

student_id:
  LOOKUP([_THISROW].[current_session_id], session_log, id, student_id)
```

#### Event:
```
Adds only
```

---

## Step 6: Security & Access Control

### 👥 **Role-Based Access**

#### For Tutors:
```yaml
Can See: Own students' homework completion records
Can Edit: completion_status, homework_rating, submitted, homework_photo, tutor_comments
Cannot Edit: Assignment details, timestamps
Show If: [tutor_id] = USEREMAIL()
```

#### For Parents:
```yaml  
Can See: Their child's homework history
Can Edit: Nothing
Show If: [student_id] IN (SELECT(students[id], [parent_email] = USEREMAIL()))
```

#### For Admin:
```yaml
Can See: All homework completion records
Can Edit: All fields
Show If: USEREMAIL() = "admin@mathconceptsecondary.academy"
```

---

## Step 7: Testing Checklist

### ✅ **Database Integration**
- [ ] Tables sync without errors
- [ ] Views return expected data
- [ ] Foreign key relationships work

### ✅ **User Interface**
- [ ] Dashboard shows pending homework checks
- [ ] Form saves completion data correctly
- [ ] History view displays past records

### ✅ **Workflow Testing**
- [ ] Auto-population of assignment data works
- [ ] Timestamps record in HK timezone
- [ ] Actions appear for correct users

### ✅ **Security Validation**
- [ ] Tutors see only their students
- [ ] Parents see only their children
- [ ] Data integrity maintained

---

## Step 8: Deployment Steps

### 🚀 **Production Rollout**

1. **Database Setup**
   ```sql
   -- Run migration
   SOURCE /path/to/010_homework_completion.sql;
   
   -- Verify tables created
   SHOW TABLES LIKE '%homework%';
   
   -- Test views
   SELECT COUNT(*) FROM homework_to_check;
   ```

2. **AppSheet Configuration**
   - Import homework_completion and homework_to_check tables
   - Configure views and actions as documented above
   - Test workflow: Dashboard → Check Homework → Quick Form → Record Completion
   - Test with 2-3 pilot tutors
   - Verify mobile functionality

3. **User Training**
   - Demo the quick homework check workflow:
     1. Open Homework Check Dashboard
     2. Tap "Check Homework" for pending item
     3. Select completion status and submit
     4. Return to dashboard (item now marked as checked)
   - Show homework history views for students
   - Practice star rating and photo capture features
   - Practice on test data with multiple homework items per session

### 🆕 **New Features Added:**

#### Star Rating System:
- Quick 1-5 star quality rating using emoji stars (⭐⭐⭐⭐⭐)
- Optional field - tutors can rate homework quality without writing comments
- Same format as performance rating in session logs
- Helps track homework quality trends over time

#### Multiple File Upload:
- Upload photos of physical homework or scanned PDFs
- Uses related `homework_files` table for unlimited attachments
- AppSheet camera integration and file picker support
- Files stored securely and viewable in history
- **Note**: Several database columns in `homework_files` are hidden in AppSheet for simplicity

4. **Go Live**
   - Deploy to all tutors
   - Monitor usage and feedback
   - Iterate based on user experience

---

## Implementation Notes

### 📁 **Simplified homework_files Table**

The `homework_files` table contains several columns that are **hidden in AppSheet** for simplicity:

#### Hidden Columns (kept for database compatibility):
- `file_type` - Database has ENUM('image', 'pdf', 'document') but AppSheet determines this automatically
- `file_name` - Database stores filename but AppSheet handles display names
- `file_size_kb` - Database column exists but AppSheet cannot populate it
- `file_order` - Database supports ordering but AppSheet uses upload timestamp
- `uploaded_by` - Database tracks uploader but can be determined from session context

#### Visible Columns (AppSheet form):
- `file_path` - The actual file upload field (⭐ **Main field**)
- `homework_completion_id` - Hidden foreign key, auto-populated

#### Benefits of Simplified Approach:
✅ **User-friendly**: Just upload files, no additional data entry
✅ **No configuration errors**: Avoids formula issues with file type detection
✅ **Future-proof**: Database structure supports advanced features if needed later
✅ **Performance**: Minimal form fields = faster user experience

#### File Upload Workflow:
1. User clicks "New" to add file to homework record
2. User uploads photo/PDF via `file_path` field
3. AppSheet handles storage and display automatically
4. All other metadata remains NULL but doesn't affect functionality

---

## Troubleshooting

### ❌ **Common Issues**

#### **"No homework to check" showing for students with assignments**
```sql
-- Check if previous sessions have homework in session_exercises
SELECT sl.*, se.* FROM session_log sl
JOIN session_exercises se ON sl.id = se.session_id
WHERE sl.student_id = X AND se.exercise_type = 'Homework' 
ORDER BY sl.session_date DESC LIMIT 5;
```

#### **Auto-population not working**
- Verify Action is set to trigger on "Adds only"
- Check LOOKUP expressions reference session_exercises table
- Ensure session_exercise_id is selected before other fields populate
- Verify foreign key relationships between homework_completion and session_exercises

#### **Performance Issues**
- Add indexes on frequently queried columns
- Optimize view queries for large datasets
- Consider archiving old homework completion records

---

*This setup enables tutors to quickly track homework completion while maintaining data integrity and providing useful insights for parents and administrators.*