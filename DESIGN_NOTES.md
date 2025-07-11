# Design Notes & Business Rules

This document outlines the specific operational rules and design decisions for the Regular Course system.

### 1. Grade Levels
-   The system will support student grades from **F1 to F6** to be future-proof.
-   All data validation and dropdown menus in the app and supporting sheets must include this full range.

### 2. Time Slots
-   The system uses a differentiated time slot model:
    -   **Weekdays:** `16:45-18:15` and `18:25-19:55`.
    -   **Weekends:** Five standard time slots (same as the previous summer course).
-   The database and app must be flexible enough to accommodate **irregular, ad-hoc time slots** for special events like exam revision sessions.
-   **UX Implementation:** The AppSheet app will feature a dependent dropdown where selecting a date filters the time slot suggestions to the appropriate weekday/weekend list.

### 3. Recurring Sessions & Payment Cycles
This is a core feature of the regular course system.

-   **Enrollment Model:** Students enroll in recurring weekly sessions which are paid for in blocks of **6 classes**.
-   **New Table Required: `enrollments`**
    -   A new table will be created to track these payment blocks.
    -   Key columns will include `student_id`, `tutor_id`, the assigned recurring `day_of_week` and `time_slot`, `number_of_lessons_paid`, and `payment_confirmation_date`.
-   **Automation 1: Session Generation**
    -   An AppSheet Bot will be triggered when a new record is added to the `enrollments` table.
    -   This bot will automatically generate the corresponding 6 session records in the `session_log` table, projecting the dates forward week by week.
-   **Automation 2: Payment Reminders**
    -   A scheduled AppSheet Bot (Report) will run daily or weekly.
    -   It will check how many "Attended" or "Scheduled" sessions are left for each student's most recent enrollment block.
    * When the number of remaining sessions is low (e.g., 2 or less), it will trigger a notification email to the administrative staff.

### 4. Student Assignment & Filtering Logic
-   The assignment process will be managed in a dedicated "Processing" Google Sheet, separate from the raw Google Form response data file, connected via `IMPORTRANGE`.

### 5. Data Management Workflow (Pre- and Post-Launch)

This section clarifies the role of Google Sheets and the AppSheet app before and after the initial database setup and app launch.

#### Pre-Launch Phase (Initial Data Setup)

The Google Sheets we are currently building (`Consolidated_Student_List`, `Registration_Processing`, etc.) serve a temporary but critical purpose. Their role is to:
1.  **Consolidate:** Combine the separate, existing student lists into one master source.
2.  **Clean & Enrich:** Match incoming form registrations with the master list to create a clean, reliable dataset.
3.  **Stage for Import:** Prepare this final, clean dataset for a one-time import into the Cloud SQL database.

#### Post-Launch Phase (Ongoing Operations)

Once the Cloud SQL database is live, the workflow changes significantly and the processing sheets become obsolete for daily tasks.

* **Single Source of Truth:** The **Cloud SQL database** becomes the definitive master record for all data.
* **Primary Tool:** The **AppSheet app** becomes the primary interface for all data management.
* **New Student Workflow:**
    1.  A new student registers via the Google Form.
    2.  The submission appears in a "Pending Registrations" view *inside the AppSheet app*.
    3.  An admin reviews the entry in the app and clicks an "Approve Student" action.
    4.  This action writes the new student's data **directly** to the SQL database. All manual spreadsheet work for new entries is eliminated.
-   A `Student_Master_List` tab within this processing sheet will serve as the source of truth for student-specific data (`Grade`, `Lang Stream`, etc.).
-   The "First Choice" sheets (e.g., `MSA (First Choice)`) must be filtered not only by the student's course selection but also by their `Grade` and `Lang Stream` as sourced from the master list. This requires a formulaic join between the form responses and the student master list.
