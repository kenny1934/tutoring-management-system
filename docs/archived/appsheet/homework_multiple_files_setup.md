# Multiple File Uploads for Homework - AppSheet Setup

## Overview
Upgrade from single photo to multiple file attachments (images + PDFs) for homework documentation. This allows tutors to capture multiple homework pages or upload scanned PDF documents.

## Prerequisites
Run database migration `013_homework_multiple_files.sql` first.

---

## Step 1: Add homework_files Table to AppSheet

### Data Source Setup
1. **Data** → **Tables** → **Add New Table**
2. Select `homework_files` from database
3. **Table Name**: `Homework Files`

### Column Configuration
| Column | Type | Settings |
|--------|------|----------|
| `homework_completion_id` | Ref | Referenced Table: `homework_completion` |
| `file_path` | File | Type: File or Image |
| `file_type` | Enum | Values: `image`, `pdf`, `document` |
| `file_name` | Text | Editable: Yes |
| `file_order` | Number | Default: 1 |
| `uploaded_by` | Email | Default: `USEREMAIL()` |

---

## Step 2: Configure File Upload Behavior

### Set Reference Relationship
1. **Data** → **Columns** → `homework_completion` table
2. **Add Virtual Column**:

#### Related Files Column
| Setting | Value |
|---------|-------|
| **Column Name** | `Related Homework Files` |
| **Type** | Ref |
| **Is a list?** | Yes |
| **Referenced Table** | `homework_files` |
| **Reference** | `homework_completion_id` |

---

## Step 3: Update Form Views

### Homework Completion Form (Updated)
**Navigate to:** UX > Views > Edit `homework_completion_Form`

#### Form Columns (Updated Order):
1. `current_session_id` (hidden, auto-set)
2. `session_exercise_id` (hidden, auto-set)
3. `student_id` (auto-populated from session)
4. `pdf_name` (auto-populated, read-only)
5. `pages` (auto-populated, read-only)
6. `completion_status` ⭐ **Main field**
7. `homework_rating` ⭐ **Star rating**
8. `submitted`
9. `tutor_comments`
10. **`Related Homework Files`** 📁 **NEW: Multiple file uploads**

#### File Upload Configuration:
```yaml
Related Homework Files:
  Display: Inline
  View Type: Table
  Allow Adds: Yes
  Allow Updates: Yes
  Allow Deletes: Yes
  Columns to Show: [file_name, file_type, file_path]
```

---

## Step 4: Create File Upload Actions

### Action 1: Quick Photo Capture
**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `📷 Add Photos` |
| **For a record of this table** | `homework_completion` |
| **Do this** | `App: go to another view within this app` |
| **Target** | `homework_files_Form` |

#### Link Configuration:
```yaml
LINKTOFORM("homework_files_Form",
  "homework_completion_id", [_THISROW].[id],
  "file_type", "image",
  "uploaded_by", USEREMAIL(),
  "file_order", COUNT([Related Homework Files]) + 1)
```

### Action 2: Upload PDF
**Navigate to:** Behavior > Actions > New Action

#### Action Settings:
| Setting | Value |
|---------|-------|
| **Action Name** | `📄 Upload PDF` |
| **For a record of this table** | `homework_completion` |
| **Do this** | `App: go to another view within this app` |
| **Target** | `homework_files_Form` |

#### Link Configuration:
```yaml
LINKTOFORM("homework_files_Form",
  "homework_completion_id", [_THISROW].[id],
  "file_type", "pdf",
  "uploaded_by", USEREMAIL(),
  "file_order", COUNT([Related Homework Files]) + 1)
```

---

## Step 5: Create File Upload Form

### homework_files Form
**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `homework_files_Form` |
| **For This Data** | `homework_files` |
| **View Type** | `Form` |
| **Show If** | `TRUE()` |

#### Form Columns:
1. `homework_completion_id` (hidden, auto-set)
2. `file_type` (hidden, auto-set based on action)
3. `file_path` **Main upload field**
4. `file_name` (auto-populated from file)
5. `file_order` (hidden, auto-calculated)
6. `uploaded_by` (hidden, auto-set)

#### Column Configuration:
```yaml
file_path:
  Type: File
  Capture: Camera or Library
  Required: Yes
  Show If: [file_type] = "image"

file_path (for PDFs):
  Type: File
  File Types: .pdf
  Required: Yes
  Show If: [file_type] = "pdf"
```

---

## Step 6: Update Display Views

### Homework Check Dashboard (Updated)
Add file attachment summary columns:

#### Additional Columns:
- `attachment_count` - Shows "3 files" or "No files"
- `attachment_types` - Shows "Photos, PDFs"

### Student Homework History (Updated)
Add file summary information:

#### Additional Columns:
- `file_count` - Number of attached files
- `attached_files` - File names with types
- `image_count` - Number of photos
- `pdf_count` - Number of PDFs

---

## Step 7: File Display Configuration

### Image Gallery View
**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Homework Images` |
| **For This Data** | `homework_files` |
| **View Type** | `Gallery` |
| **Show If** | `[file_type] = "image"` |
| **Sort Order** | `file_order` |

### PDF List View
**Navigate to:** UX > Views > New View

#### View Settings:
| Setting | Value |
|---------|-------|
| **View Name** | `Homework PDFs` |
| **For This Data** | `homework_files` |
| **View Type** | `Table` |
| **Show If** | `[file_type] = "pdf"` |
| **Sort Order** | `file_order` |

---

## Step 8: Update Menu and Navigation

### Updated Workflow:
1. **Tutor marks homework as submitted** (existing workflow)
2. **Tutor opens homework details** → Sees file attachment section
3. **Choose upload method**:
   - `📷 Add Photos` → Opens camera/gallery for multiple photos
   - `📄 Upload PDF` → Opens file picker for PDF upload
4. **Files display in organized list** with preview capabilities

### File Management Features:
- **Reorder files**: Drag and drop or edit `file_order`
- **Delete files**: Swipe to delete or edit action
- **Preview files**: Tap to open full view
- **File types**: Automatic detection and appropriate icons

---

## Benefits of Multiple File Support

### For Tutors:
- **Flexible documentation**: Photos OR PDFs OR both
- **Complete homework capture**: Multi-page assignments
- **Professional presentation**: Clean file organization
- **Easy sharing**: Files ready for parent communication

### For Students/Parents:
- **Scan entire homework**: Single PDF upload
- **Photo convenience**: Quick multiple photos
- **Quality options**: Choose best format for content
- **Complete records**: All homework documentation in one place

---

## Technical Notes

### File Storage:
- AppSheet handles file storage and security
- Files are linked to homework records via foreign key
- Automatic cleanup when homework records are deleted

### Performance:
- Images are automatically compressed by AppSheet
- PDF files maintain original quality
- Thumbnails generated for quick preview

### Security:
- Files inherit homework record permissions
- Only authorized tutors can upload/view files
- Student data protection maintained

This upgrade transforms homework documentation from single photos to comprehensive multimedia records while maintaining the simple, fast workflow tutors need.