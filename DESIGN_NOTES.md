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

#### `Consolidated_Student_List` Sheet
* **Purpose:** To create a single, unified master list of all students from the separate source files (e.g., MSA list, MSB list).
* **Implementation:** The sheet uses an `IMPORTRANGE` formula to pull data from each source file. As it imports the data, a new `Location` column is programmatically added to each record (e.g., "MSA", "MSB") so that every student has an associated location. This sheet also uses the `TO_TEXT` function to ensure all Student IDs are treated as text to prevent data type mismatches.

#### `Registration_Processing` Sheet
* **Purpose:** To serve as a workspace for an administrator to match new, unverified form registrations with the official student records from the `Consolidated_Student_List`. This is the key human-in-the-loop quality control step.
* **Workflow:**
    1.  **Data Ingestion:** A formula automatically pulls in new registrations from the raw `Form Responses (Live)` sheet, merging the Chinese and English columns into a clean list.
    2.  **Data Standardization:** Helper formulas automatically translate form inputs into standardized data (e.g., the long "Branch Choice" text is converted to "MSA" or "MSB" in a dedicated `Location` column).
    3.  **Manual Verification (The Admin Task):** An administrator looks at the `Student Name (from Form)` for each new registration and enters the corresponding **Official Student ID** into the `Student ID (Manual Input)` column.
    4.  **Automatic Enrichment:** Once the correct ID is entered, a final set of `XLOOKUP` formulas automatically populates the remaining columns (`Official Student Name`, `Official Grade`, `Official Lang Stream`, etc.) by pulling the correct data from the `Consolidated_Student_List`. This lookup is precise as it uses both the `Location` and the verified `Student ID`.

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
  
### 6. Data Entry & Assignment Workflow Models

This section outlines the two potential architectural models for handling the regular course enrollment and assignment process. A final decision will be made before building the corresponding AppSheet views and actions.

---
#### **Model A: The "App-First" Model**

This model centralizes all work within the AppSheet application after the initial data setup.

* **Concept:** All data entry and assignment tasks are performed directly within the AppSheet application. The Google Sheets are used primarily for initial data collection (Google Form) and final reporting (dashboards).
* **Workflow:**
    1.  An admin views new registrations from the Google Form inside a dedicated "Pending Registrations" view **in the app**.
    2.  The admin uses an "Assign Schedule" action **in the app**, which opens an app form.
    3.  On this form, they select the recurring `Assigned Day`, `Time`, `Tutor`, etc.
    4.  Saving the form writes the new record directly to the `enrollments` table in the Cloud SQL database.
* **Role of Spreadsheets:** The `MSA/B Assignments` sheets are **eliminated** from the daily workflow. The `Final Schedule` grid becomes a **read-only report** connected directly to the live SQL database.
* **Pros:**
    * Creates a single, secure point of data entry.
    * No complex data migration from sheets to the database is needed for ongoing work.
    * The workflow learned by the team is the final, permanent one.
* **Cons:**
    * All app views and actions for enrollment must be fully built before the team can begin processing students.
    * Initial bulk assignment of many students may be slower through individual app forms than in a spreadsheet grid.

---
#### **Model B: The "Hybrid" Model**

This model retains the Google Sheets as a key workspace for planning and preparation.

* **Concept:** The `MSA/B Assignments` sheets are used as a flexible, collaborative workspace for planning, and the AppSheet app is used for final data submission and management.
* **Workflow:**
    1.  New student registrations are automatically populated into the `MSA/B Assignments` sheet from the `Registration_Processing` sheet.
    2.  The admin team works **directly in the spreadsheet** to assign the `Day`, `Time`, `Tutor`, etc., for each student.
    3.  Once a student's assignment is finalized in the sheet, the admin goes into the AppSheet app.
    4.  An action in the app will allow the admin to select the finalized row from the spreadsheet and "submit" or "promote" it, which then creates the official record in the `enrollments` table in Cloud SQL.
* **Role of Spreadsheets:** The `Assignments` sheets remain a **critical, interactive part** of the workflow for planning and data preparation before final submission.
* **Pros:**
    * Uses a familiar spreadsheet interface that is very efficient for bulk planning and visualization.
    * The team can begin planning and assigning students before the app's data entry forms are perfected.
* **Cons:**
    * Data temporarily exists in two places (the "planned" data in the sheet and the "official" data in the database), which requires a clear process to keep them in sync.
    * Requires a robust mechanism in the app to "pull" the data from the sheet row into the database.
 
### 7. Development Strategy & Data Handling

This section outlines key strategies for the app's development phase and how specific data points will be managed.

#### Student Data Management (During Development)
To handle the fact that the master student list is still being actively updated, the development of the app will follow a **"Live Sheet"** strategy:
-   The **`students`** data source within the AppSheet app will **temporarily point to the `Consolidated_Student_List` Google Sheet**. This ensures the app always uses live, up-to-the-minute student data during the entire building and testing phase.
-   All other primary tables (`tutors`, `enrollments`, `session_log`) will be connected to the Cloud SQL database from the start.
-   On the official "go-live" date, a final data import will be performed, and the `students` data source in AppSheet will be switched from the Google Sheet to the Cloud SQL table.

#### Data Column Notes
-   **`phone` Column:** This column will exist in the `students` SQL table. To ensure data privacy, its visibility within the AppSheet app will be restricted using a `Show_If` condition: `LOOKUP(USEREMAIL(), "tutors", "user_email", "role") = "Admin"`. This ensures only users with the "Admin" role can view student phone numbers.
-   **`grade` Column:** The `students` table will hold the official grade on record. However, the grade submitted in the new registration Google Form will be considered the most current. A workflow will be built into the AppSheet app for admins to easily update a student's official grade in the database based on new registration data.

