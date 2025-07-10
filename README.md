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
* **Advanced Automation:** Google Apps Script (if required)

## Project Roadmap

### Phase 1: Data Foundation
-   [x] Design and create the core database schema in Cloud SQL (`tutors`, `students`, `session_log`, etc.).
-   [ ] Establish the data processing workflow from Google Forms to the assignment sheets.
-   [ ] Finalize and populate the `LangStream_Overrides` and other helper sheets.

### Phase 2: AppSheet Application
-   [ ] Connect the AppSheet app to the Cloud SQL data sources.
-   [ ] Implement Role-Based Access Control (RBAC) based on the `tutors` table.
-   [ ] Build core views (Schedules, Student Lists, etc.).
-   [ ] Create key actions (Mark Attendance, Log Materials, Reschedule).
-   [ ] Implement the `Enrollments` system and the associated automations for session generation and payment reminders.

### Phase 3: Reporting & Dashboards
-   [ ] Set up the individual tutor schedule sheets using the `IMPORTRANGE` + `QUERY` method.
-   [ ] Build any required administrative or performance dashboards.
