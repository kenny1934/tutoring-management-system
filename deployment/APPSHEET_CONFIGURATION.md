# AppSheet Configuration Guide - Planned Reschedules Feature

## Step 1: Add planned_reschedules Table to AppSheet

### 1.1 Connect New Table
1. **Go to:** AppSheet Editor → Data → Tables
2. **Click:** + (Add new table)
3. **Select:** Cloud SQL
4. **Choose:** Your existing csm_db database connection
5. **Select table:** `planned_reschedules`
6. **Click:** Add table

### 1.2 Configure Column Types
**Verify these column settings in AppSheet:**

| Column | Type | Key | Required | Initial Value | Notes |
|--------|------|-----|----------|---------------|-------|
| `id` | Number | Yes | Yes | (auto) | Primary key |
| `enrollment_id` | Ref | No | Yes | (none) | Reference to enrollments |
| `planned_date` | Date | No | Yes | (none) | Date of original session |
| `reschedule_to_date` | Date | No | No | (none) | Optional make-up date |
| `reason` | Text | No | No | (none) | Why rescheduling |
| `status` | Enum | No | No | "Pending" | Pending,Applied,Cancelled |
| `requested_date` | Date | No | Yes | TODAY() | When request was made |
| `requested_by` | Text | No | No | USEREMAIL() | Who made request |
| `notes` | LongText | No | No | (none) | Additional notes |

### 1.3 Set Reference for enrollment_id
1. **Click:** `enrollment_id` column
2. **Set Type:** Ref
3. **Referenced Table:** enrollments
4. **Referenced Column:** id
5. **Is a part of:** No
6. **Reverse reference label:** Planned_Reschedules

### 1.4 Configure status as Enum
1. **Click:** `status` column
2. **Set Type:** Enum
3. **Values:** 
   ```
   Pending
   Applied
   Cancelled
   ```
4. **Initial value:** "Pending"

## Step 2: Add Virtual Columns to enrollments Table

### 2.1 Pending_Reschedules_Count
1. **Go to:** enrollments table → Columns
2. **Add virtual column:** `Pending_Reschedules_Count`
3. **Type:** Number
4. **App formula:** 
   ```javascript
   COUNTIFS(
     planned_reschedules[enrollment_id], [id],
     planned_reschedules[status], "Pending"
   )
   ```

### 2.2 Next_Planned_Reschedule
1. **Add virtual column:** `Next_Planned_Reschedule`
2. **Type:** Date
3. **App formula:**
   ```javascript
   MINIFS(
     planned_reschedules[planned_date],
     planned_reschedules[enrollment_id], [id],
     planned_reschedules[status], "Pending",
     planned_reschedules[planned_date], ">=" & TODAY()
   )
   ```

## Step 3: Add Virtual Columns to planned_reschedules Table

### 3.1 Student_Name
1. **Go to:** planned_reschedules table → Columns
2. **Add virtual column:** `Student_Name`
3. **Type:** Text
4. **App formula:**
   ```javascript
   LOOKUP(
     LOOKUP([enrollment_id], "enrollments", "id", "student_id"),
     "students", "id", "student_name"
   )
   ```

### 3.2 Days_Until_Leave
1. **Add virtual column:** `Days_Until_Leave`
2. **Type:** Number  
3. **App formula:**
   ```javascript
   [planned_date] - TODAY()
   ```

## Step 4: Create Views

### 4.1 View: "Manage Planned Reschedules"
1. **Go to:** UX → Views
2. **Click:** + (New view)
3. **Settings:**
   - **Name:** Manage Planned Reschedules
   - **For this data:** planned_reschedules
   - **View type:** Table
   - **Filter condition:** `[status] = "Pending"`
   - **Sort by:** planned_date (ascending)

4. **Columns to show:**
   - Student_Name
   - planned_date  
   - reschedule_to_date
   - reason
   - requested_by
   - Days_Until_Leave
   - status

### 4.2 View: "Add Planned Reschedule" 
1. **Create new view:**
   - **Name:** Add Planned Reschedule
   - **For this data:** planned_reschedules
   - **View type:** Form
   - **Position:** Menu

2. **Columns to show:**
   - enrollment_id (Dropdown)
   - planned_date
   - reschedule_to_date
   - reason
   - notes

## Step 5: Create Actions

### 5.1 Action: "Plan Reschedule" (for enrollments)
1. **Go to:** Behavior → Actions
2. **Click:** + (New action)
3. **Settings:**
   - **Name:** Plan Reschedule
   - **Display name:** 📅 Plan Reschedule
   - **For a record of this table:** enrollments
   - **Do this:** App: add new row to another table using values from this row
   - **Target:** planned_reschedules

4. **Set these columns:**
   ```javascript
   enrollment_id: [_THISROW].[id]
   requested_date: TODAY()
   requested_by: USEREMAIL()  
   status: "Pending"
   ```

### 5.2 Action: "Cancel Reschedule" (for planned_reschedules)
1. **Create new action:**
   - **Name:** Cancel Reschedule
   - **Display name:** ❌ Cancel
   - **For a record of this table:** planned_reschedules
   - **Do this:** App: edit this row using values from a form
   - **Only if this condition is true:** `[status] = "Pending"`

2. **Set these columns:**
   ```javascript
   status: "Cancelled"
   ```

## Step 6: Add Menu Items

### 6.1 Add to Main Menu
1. **Go to:** UX → Menu
2. **Add menu item:**
   - **Display name:** Manage Reschedules
   - **Action:** View "Manage Planned Reschedules"

### 6.2 Add to Enrollments View
1. **Go to enrollments table view**
2. **Add action button:** Plan Reschedule action

## Step 7: Test Configuration

### 7.1 Data Entry Test
1. Go to "Add Planned Reschedule" view
2. Try adding a test reschedule record
3. Verify all fields save correctly

### 7.2 Virtual Columns Test  
1. Check enrollments view
2. Verify Pending_Reschedules_Count shows correctly
3. Verify Next_Planned_Reschedule displays properly

### 7.3 Actions Test
1. From enrollments, click "Plan Reschedule"
2. Verify form pre-fills correctly
3. Test "Cancel Reschedule" action

---

**✅ Configuration Complete!** 
Your AppSheet interface for planned reschedules is now ready for testing.