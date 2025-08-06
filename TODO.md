# CSM Pro: Strategic To-Do List

This document outlines the implementation plan for the CSM Pro application, broken down by operational function.

---
### ## Phase 2: Complete Core Enrollment & Scheduling

*The goal is to make the app fully functional for basic daily operations.*

-   [ ] **Finalize MSB Sheets:** Duplicate and adapt all `MSA` sheet logic and formulas for the `MSB` workflow.
-   [ ] **Build Core UX Views:**
    -   [ ] **My Schedule:** A calendar or deck view for tutors to see their daily/weekly sessions.
    -   [ ] **Student Profile:** A detailed view for each student, serving as a central hub for their information and related actions.
    -   [ ] **Enrollment History:** An inline view on the Student Profile showing all past and current enrollment blocks.
-   [ ] **Implement Core Actions:**
    -   [ ] **Mark Attendance:** Create the action for tutors to mark sessions as "Attended", "No Show", etc.
    -   [ ] **Edit Session Notes:** Allow tutors to add notes to session records.
-   [x] **Implement Audit Trails:**
    -   [x] Add `last_modified_by` and `last_modified_time` columns to the `session_log` and `enrollments` tables.
    -   [x] Integrate the update of these columns into all relevant actions (`Mark Attendance`, `Edit Notes`, `Generate Sessions`).

---
### ## Phase 3: Financial Management & Renewals

*The goal is to automate and streamline the entire student payment lifecycle.*

-   [x] **Renewal Workflow Foundation:**
    -   [x] **View:** Create a dedicated database view (`active_enrollments_needing_renewal`) to identify enrollments with 2 or fewer sessions left.
    -   [x] **Holiday Logic:** Implement a `holidays` table and update the session generation script to skip non-working days.
    -   [x] **End Date Calculation:** Create a robust SQL function (`calculate_end_date`) to determine the accurate, holiday-adjusted end date for renewals.
-   [X] **Renewal AppSheet UI:**
    -   [X] **View:** Create a dedicated "Renewals" view in the app that displays the `active_enrollments_needing_renewal` data.
    -   [X] **Action:** Build a "Renew Enrollment" action. This should intelligently pre-fill the new enrollment form with data from the student's previous one, automatically suggesting the next `first_lesson_date`.
-   [x] **Payment Reminder System:**
    -   [x] **Bot:** Design a scheduled AppSheet Bot that runs weekly.
    -   [x] **Logic:** The bot will scan the `session_log` to find active enrollments with 1 or 2 `Scheduled` sessions left.
    -   [x] **Notification:** The bot will send a summary email or push notification to the admin team, listing the students who need to be contacted for renewal.
-   [x] **Overdue Payment Workflow:**
    -   [x] **View:** Create a dedicated "Overdue Accounts" view, filtered for enrollments with `Payment_Status` = "Overdue" or "Pending Payment".
    -   [x] **Action:** Build the "Confirm Payment" action. This action will change the `Payment_Status` to "Paid" and update the `Financial_Status` of all related sessions from "Unpaid" to "Paid".
    -   [x] **Bot:** Enhance the "Generate Recurring Sessions" bot to handle the scenario where an overdue enrollment is marked as "Paid," ensuring it generates the remaining sessions for the block.
-   [ ] **Trial Class System:**
    -   [ ] **Action:** Build the "Book Trial Class" action for new students.
    -   [ ] **Action:** Build the "Convert Trial to Enrollment" action. This should open a new enrollment form and potentially link to the trial session ID to track the conversion source.
-   [x] **Fee Message System:**
    -   [x] **Discount Management:** Built discount system with common amounts (0, 150, 200, 300, 500) integrated into enrollment workflow.
    -   [x] **Virtual Columns:** Implemented comprehensive fee calculation system with `Final_Fee` and enhanced Chinese `Fee_Message` virtual columns with location awareness.
    -   [x] **Assignment Sheet Integration:** Created Google Sheets formulas for pre-enrollment fee messages with holiday-aware lesson date calculation.
    -   [x] **Copy Actions:** Implemented clipboard service integration for easy fee message copying.

---
### ## Phase 4: Administration & Reporting

*The goal is to provide high-level oversight and data management tools for administrators.*

-   [x] **Enhanced Apps Script Functions:**
    -   [x] **Student Data Sync:** Implemented working student list sync from MySQL to Google Sheets with "CSM Admin Tools" menu.
    -   [x] **Robust Student Updates:** Enhanced student info updates using `school_student_id` + `home_location` for reliable identification.
    -   [x] **Combined Update Function:** Single function handles both grade and phone updates with comprehensive error handling.
-   [x] **UI/UX Improvements:**
    -   [x] **Clean Navigation:** Created "Admin Tools" menu to organize utility views and maintain clean main navigation.
    -   [x] **Clear Terminology:** Updated view names ("Ready to Enroll") and status values ("Unpaid/Paid/Enrolled") for better admin team understanding.
    -   [x] **Cross-Location Visibility:** Implemented dual views for MSA/MSB teams to see relevant assignments across locations.
-   [ ] **Admin Dashboard:**
    -   [ ] Create a primary dashboard view in the app showing key metrics: New Registrations, Active Enrollments, Overdue Accounts, Tutor Workload.
-   [ ] **Data Management Views:**
    -   [ ] Build user-friendly views and forms for managing the `tutors` and `discounts` tables directly in the app.
-   [ ] **Financial Reporting:**
    -   [ ] Design a Google Sheet report connected to the Cloud SQL database to track key financial data (e.g., revenue per month, discount usage, tutor payroll calculations).

---
### ## Phase 5: System Enhancements & Future Improvements

*The goal is to implement additional features and optimizations for production use.*

-   [ ] **Data Integrity & Quality:**
    -   [ ] Implement duplicate session prevention system (documented in `FUTURE_IMPROVEMENTS.md`)
    -   [ ] Add comprehensive data validation rules
    -   [ ] Create automated data consistency checks
-   [ ] **Final Data Migration:**
    -   [ ] Perform the final, one-time import of the `Consolidated_Student_List` into the Cloud SQL `students` table.
    -   [ ] In AppSheet, switch the `students` table data source from the Google Sheet to the Cloud SQL table.
-   [ ] **Decommission Hybrid Workflow:**
    -   [ ] Remove the `Assignments` sheets as data sources from the app.
    -   [ ] Build the "app-first" enrollment workflow for handling all new students directly within the app, as designed.
-   [ ] **User Training & Rollout:**
    -   [ ] Prepare a short guide or training session for the admin team on the new, fully app-based workflows.
    -   [ ] Announce the official "cut-off" date to the team.