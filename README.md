# Tutoring Management System (CSM) Project

This repository contains the documentation, scripts, and design specifications for the custom CSM (Class Session Manager) application built with AppSheet, Google Cloud SQL, and Google Sheets.

## Project Goal

The primary goal of this project is to develop a robust, scalable, and efficient system to replace manual spreadsheet-based workflows. The application will manage all aspects of the regular tutoring course, including student enrollment, session scheduling, attendance tracking, material logging, and reporting.

Key objectives include:
-   **Centralized Data:** Using a Cloud SQL database as the single source of truth.
-   **Role-Based Access:** Providing a secure, per-user experience for Admins, Tutors, and other roles.
-   **Automation:** Automating the generation of recurring sessions and payment reminders.
-   **Real-time Reporting:** Creating high-performance, live dashboards using a formula-driven approach.

## Technology Stack

* **Frontend & Business Logic:** AppSheet
* **Database:** Google Cloud SQL
* **Data Staging & Reporting:** Google Sheets
* **Advanced Automation:** Google Apps Script

## Project Status & Roadmap

### Phase 1: Foundation & Hybrid Workflow (Completed)

This initial phase focused on establishing a solid data backend and a functional "Hybrid" workflow to handle the initial bulk enrollment period.

* **Cloud SQL Database:**
    * [x] Deployed a production-ready Cloud SQL (MySQL) instance on the corporate Google Workspace account.
    * [x] Designed and created the core database schema: `tutors`, `students`, `enrollments`, `session_log`, and `discounts`.
    * [x] Established a secure connection between the database and AppSheet.

* **Google Sheets (Hybrid Workflow Staging):**
    * [x] Created the `"CSM Regular Course - Assignments"` workbook as the central staging area.
    * [x] **`Consolidated_Student_List`:** Built a unified student master list by importing and combining data from separate source files. Implemented an Apps Script with a UI button (`CSM Admin Tools > Refresh Student List`) to keep this sheet synchronized with the SQL `students` table.
    * [x] **`MSA/B Final Schedule`:** Created the master visual grid for high-level tutor allocation and class planning.
    * [x] **`Schedule_Lookup_Data`:** Developed a robust formula-driven helper sheet to "unpivot" the visual schedule grid into a searchable list, enabling complex lookups.
    * [x] **`MSA/B Assignments` Sheets:** Established as the primary workspace for the admin team. It automatically pulls student data and uses the `Schedule_Lookup_Data` to look up the correct `Assigned Tutor` based on Day, Time, Grade, and Stream.

* **CSM Pro App (Core Automation):**
    * [x] Created the "CSM Pro" AppSheet application.
    * [x] Connected the app to both the Cloud SQL database (for permanent records) and the `Assignments` Google Sheet (for the hybrid workflow).
    * [x] **`Submit Enrollment` Action:** Built the core action that allows an admin to promote a finalized assignment from the spreadsheet into an official `enrollments` record in the database.
    * [x] **`Generate Recurring Sessions` Bot:** Developed and debugged a robust automation. It uses a webhook to call a dedicated Google Apps Script, which reads the new enrollment from the database and uses the AppSheet API to reliably generate the correct number of session records.

### Phase 2: Core Application Build-out (In Progress)

This phase focuses on building the essential user interface and features within the AppSheet app for daily operations. See `TODO.md` for a detailed task list.

### Phase 3: Financial Management & Renewals (Next)

This phase will build the critical workflows for managing the entire student lifecycle, from trial classes to renewals and overdue payments.

### Phase 4: Go-Live & System Transition (Future)

This final phase involves the final data migration, decommissioning the temporary spreadsheet workflows, and transitioning the team to a fully "app-first" operational model.
