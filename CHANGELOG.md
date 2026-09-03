# Changelog

## [2.0.127](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.126...v2.0.127) (2026-09-03)


### New Features

* **School Progress suggests worksheets for what each school is on this week**: while setting a session's exercises, tutors see the topics the student's school is likely covering, with worksheets ranked by that school's own usage, and can confirm or correct the topic with one tap.
* **Revision papers surface before a test**: when a student has a test coming up, the suggestions switch to the test's scope and bring up the revision papers tutors made for that test or for similar ones.
* **A new Curriculum page**: see any school's year week by week, compare its pace with other schools, browse the topic map, search topics, and open a revision pack for any test.
* **The session page's curriculum tab now uses the same timelines**: it shows the school's neighbouring weeks instead of last year's sheet.

## [2.0.126](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.125...v2.0.126) (2026-08-30)


### New Features

* **Admins can move a summer lesson past 31 August**: placing a summer lesson or make-up after the summer cut-off no longer needs a Super Admin.

## [2.0.125](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.124...v2.0.125) (2026-08-26)


### New Features

* **Handover notes now reach the students who skipped summer**: a P6 student who came straight to the September intake without a summer course now shows the note their primary branch tutor wrote, bringing in 53 students whose note nobody could see.
* **The handover note also shows on the lesson page**: the full lesson page now carries it, along with the sibling note and the family's preferred tutor and time.
* **F5 and F6 grade badges have their own colours**: both years are coloured by language stream now instead of coming out grey.
* **The 2026-2027 school curriculum sheet is in the tools menu**: it sits with the others under Useful Tools, and last year's sheet now says 2025-2026 in its description.

## [2.0.124](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.123...v2.0.124) (2026-08-26)


### New Features

* **Mark a free class as waived**: the enrolment page's payment status has a Waived option for a class given free of charge, which owes nothing, is never chased for payment, and counts nothing towards tutor revenue. Moving it back to Pending Payment restores the real fee.


### Bug Fixes

* **Payment changes show on the lessons straight away**: marking an enrolment paid or waived now updates the payment markers on its lesson list without a reload.

## [2.0.123](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.122...v2.0.123) (2026-08-25)


### Bug Fixes

* **Every page shows the record you opened, not the one before it**: moving straight from one student, lesson, enrolment or application to the next no longer shows the previous one's details under the new name, on every page and panel where that could still happen.
* **Sessions after a tutor's last day only counts the lessons that still need somebody**: rescheduled, cancelled, sick leave and weather cancelled lessons are left out, so the count is the work that has to move onto someone else.

## [2.0.122](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.121...v2.0.122) (2026-08-23)


### Bug Fixes

* **A coupon stays with the student it belongs to**: stepping from one September applicant to the next no longer carries the previous student's coupon, staff referral badge or discount onto the new one.
* **Buddy group fees are priced against the right group**: a grouped summer application is priced against its own group rather than the one opened before it, in both the fee box and the fee message.
* **Enrolment details belong to the enrolment you opened**: opening one enrolment after another from the renewals and trials pages no longer shows the earlier one's fee, payment status and dates.

## [2.0.121](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.120...v2.0.121) (2026-08-21)


### Bug Fixes

* **Staff referral discount on September applications**: a Regular Intake application whose student is marked as a staff referral now shows the badge and preselects the $500 staff discount at the publish step, ahead of any coupon or seasonal offer.
* **School filter readable in dark mode**: the school select on the arrangement board's unassigned panel now takes the same colours as the filter chips beside it.

## [2.0.120](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.119...v2.0.120) (2026-08-19)


### New Features

* **Summer applications recognise school spellings too**: a summer application now shows the school code its typed name is recognised as, with the same box the Regular Intake pages have for saying which school an unfamiliar spelling means.

## [2.0.119](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.118...v2.0.119) (2026-08-19)


### New Features

* **Filter September applicants by the branch they come from**: the applications page in Regular Intake gains the branch origin filter the summer page already has, including New (no branch) for applicants with no MathConcept history.
* **Creating a student from an application starts with the school code**: the create student form opens with the matching school code filled in when the app recognises the school a family typed.

## [2.0.118](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.117...v2.0.118) (2026-08-19)


### New Features

* **Which schools the September intake comes from**: the Applications page in Regular Intake gains a stats view whose headline chart counts applicants by school, reading around 260 known spellings as the school they mean. It also carries the status pipeline, grades, preferred branch and submissions by day.
* **Teaching the app a new school spelling**: when an application names a school the app cannot place, the stats view and the application's own page both offer a box to say which school it means.
* **Schoolmates on the arrangement board**: pick a school while arranging September classes and every student from it lights up across the board and the unassigned list, so friends can be placed together.

## [2.0.117](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.116...v2.0.117) (2026-08-19)


### New Features

* **A tutor can now cover lessons at the other branch**: say on their record that they also cover another branch, and they can be given a lesson, a make-up or an exam revision slot there.
* **Cover can be limited to certain days or dates**: pick the weekdays and a first and last day, or leave it blank to run on, and somebody covering one Saturday only appears in the tutor lists that day.

## [2.0.116](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.115...v2.0.116) (2026-08-15)


### Bug Fixes

* **A tutor filter no longer moves itself to somebody else after a departure**: a filter pointed at a tutor who has left now stays on them, with their leaving date beside the name, instead of jumping to whoever comes first in the list.
* **Lessons still booked past a tutor's last day now open as a week**: that list opens as a week on the first week holding lessons to move, and every day and time in the list view now carries its date.

## [2.0.115](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.114...v2.0.115) (2026-08-15)


### New Features

* **Nobody gets booked for lessons after they have left**: the app reads everybody's last working day from ARK each night, and no lesson, class or duty can be placed on a tutor after that day. The office gets a notice naming who is leaving and what is still booked past their last day.
* **A record of everyone's last working day, kept without asking**: a tutor's page shows whether they are leaving and when, and a button reads the latest from ARK straight away.

## [2.0.114](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.113...v2.0.114) (2026-08-14)


### New Features

* **Logging one call against a whole list of families on Course Renewal**: a tutor can tick several students on their Course Renewal list and log a single contact against all of them, the way the Retention board already allowed.
* **September classes drawn as a week rather than a list**: the September tab on Course Renewal lays the classes out as a week, with the times down the side and the days across the top, and becomes a day by day agenda on a phone.


### Bug Fixes

* **The grade on the September timetable is the one the student is entering**: September classes and the students in them now show the grade the family applied for, not the Pre-F5 style grade used through the summer.
* **When the September form and our records disagree about a student's language stream**: the app now goes by the form, because it is the more recent answer, and says where the two differ so an admin can put the record on the same stream with one press.

## [2.0.113](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.112...v2.0.113) (2026-08-13)


### Bug Fixes

* **The chase list on the Retention tab fits a folding phone's inner screen**: the filters above the chase list now fold into the same Filters button a phone gets, so the students are no longer pushed off the bottom of the card.

## [2.0.112](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.111...v2.0.112) (2026-08-13)


### New Features

* **Finding one family on the list of prospects still to chase**: the still to chase list has a search box reading the name, both phone numbers, the school and the codes their primary branch and summer course know them by, and what the list is showing travels in the address so it can be shared.

## [2.0.111](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.110...v2.0.111) (2026-08-12)


### New Features

* **Who has not come back for September, and who to ring about it**: Regular Intake has a new Retention tab that takes everyone who studied with us last year and says whether they have applied for September, broken down by branch, grade, tutor and origin. Its chase list carries the phone number and the last thing said to that family, and a call can be logged without leaving the page.
* **Tutors have their own list of who has come back**: a Course Renewal page in the side menu shows a tutor the students they taught last year and where each of them has got to, so the person who knows the family can do the chasing.


### Improvements

* **The terminated students report opens in a few seconds**: it now works out only the enrolments that could fall in the quarter being asked for, so it opens in about three seconds rather than fifteen.
* **One list of contact types, and a type for course renewal**: the contact types offered when logging a parent contact come from one list now, and it has gained Course Renewal.


### Bug Fixes

* **The P6 Prospects page now refuses people who cannot read it**: somebody without access is told so instead of seeing an empty table. The records behind that page were always admin only.

## [2.0.110](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.109...v2.0.110) (2026-08-12)


### Bug Fixes

* **Back to School applicants were quoted MOP 100 too much**: the fee message asked for MOP 2,200 when the September intake collects no materials fee, so every fee message, total and preview now says MOP 2,100. No application had been published while this was wrong.
* **Saving the course settings no longer drops rules the form does not show**: the summer and September settings pages now keep pricing rules that have no box of their own, and whether the materials fee is collected has become a tick box on the September page.
* **The application window keeps up with what it has just done**: the window now reads the application back after every change, including publishing, so what is on screen matches what has been saved.

## [2.0.109](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.108...v2.0.109) (2026-08-11)


### New Features

* **Homework set in earlier lessons can be marked from lesson mode**: the homework still waiting sits at the top of the exercise list, with the same marking, star rating, comment and photographs offered everywhere else, and pressing H opens it from anywhere in the lesson.


### Bug Fixes

* **Homework marked in an earlier lesson no longer looks unmarked**: the mark now comes from the student's own record, so it stays where it was put.

## [2.0.108](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.107...v2.0.108) (2026-08-11)


### New Features

* **A student's whole homework record, and marking, on their own page**: every piece of homework on the Courseware tab now shows how it went, and clicking that mark opens the piece so the state, star rating, comment and photographs can be put right without leaving the page.
* **Homework that came back but has not been marked yet now has its own state**: a fifth state, Handed in, counts as still waiting, so work sitting in a tutor's bag is no longer recorded the same as work that never arrived.


### Improvements

* **The homework keys in lesson mode follow the order on screen**: 1 is handed in, 2 done, 3 partly done and 4 not done, with 0 still clearing.

## [2.0.107](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.106...v2.0.107) (2026-08-10)


### New Features

* **Homework set in an earlier lesson can be marked as done**: each piece of homework carries four states, not checked, done, partly done and not done, with a star rating and a comment, and stays on the list for up to three lessons the student actually sat.
* **What a student handed in can be kept with the record**: photographs and PDFs attach to a piece of homework, and on a phone the camera opens straight from the button.


### Improvements

* **Regular Intake shows how many applications are waiting**: the side menu item now carries the same count of applications still to work through that Summer Course has, following the branch picked in the menu.


### Bug Fixes

* **A category on the terminated students page can be cleared again**: picking None now clears a category set by mistake, and emptying the reason box records no reason.

## [2.0.105](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.104...v2.0.105) (2026-08-07)


### New Features

* **The prospect journey chip opens the prospect's record**: clicking the chip on a September application now opens the prospect's record over the page, including the primary tutor's remark behind it.


### Bug Fixes

* **Link suggestions only offer applications the prospect could belong to**: every suggestion is now held to the grade the prospect is entering, which took the September review list from 15 rows to 1 and the summer list from 17 to 2.
* **A prospect's grade reads the same on every page**: grades are put into one form as they are taken in, and the 113 records holding another spelling have been corrected.
* **Esc closes one panel at a time**: whichever panel is on top now takes the key press and the one beneath waits its turn, which applies to clicking outside a panel as well.

## [2.0.104](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.103...v2.0.104) (2026-08-05)


### New Features

* **Link suggestions can now find P6 prospects for September applications**: the button on the September applications page now matches P6 prospects as well as student records, by the student they enrolled as over the summer and then by phone.
* **The prospect journey shows the primary branch code**: the chip now leads with the applicant's code at their primary branch, so a card reads MCP-1112 to summer to regular and can be checked against that branch's records.
* **The claim badge names the branch**: an application from somebody who says they already study with us now names the centre they picked, for example Claims: MTR.


### Improvements

* **The branch a student came from fills itself in**: linking a P6 prospect to a September application records that prospect's branch as the applicant's verified origin, and a branch chosen by hand is never overwritten.
* **Applications with no branch origin can be filtered**: the More filters menu on the September applications page gained an Unverified branch origin tick box, matching the summer page.
* **Notes show on the cards you drag**: the September arrangement page shows an application's internal note on its card in the unassigned list, shortened to one line with the whole note on hover.


### Bug Fixes

* **Demand colours on the arrangement timetable match the rest of the app**: a demand row's bar and its label now both use the grade badge colour used everywhere else.
* **One branch badge instead of two**: a card drops the from MCP badge when the journey chip already says the same thing, and keeps it when it does not.

## [2.0.103](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.102...v2.0.103) (2026-08-05)


### New Features

* **A certificate list for the summer course**: a new Certificates tab lists every enrolled summer student with their branch, code and sessions attended, badges the ones who met the official 80% rule, and exports as a CSV file.

## [2.0.102](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.101...v2.0.102) (2026-08-05)


### New Features

* **The arrangement timetable can go full screen**: a new button on the summer and September arrangement pages collapses the header into a slim strip so the timetable takes almost the whole window, and Esc returns it.


### Improvements

* **A tidier toolbar above the timetable**: the Tutor Duties, Workload and full screen buttons are now compact icons with hover hints, leaving more room for the status counts and filters.


### Bug Fixes

* **Shorter summer plans finish at their own length**: a student who arranged fewer than the full course of lessons now counts as finished once every lesson in their own plan is placed.

## [2.0.101](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.100...v2.0.101) (2026-08-04)


### New Features

* **Every prospect carries a journey for each course**: the prospects page shows where each P6 prospect stands with the summer course and with the September intake separately, read straight from their linked applications, and both journeys can be filtered on.
* **The conversion page reads in three tabs**: Overview holds the headline figures, Breakdowns holds stated intention against outcome and the feeder tables, and Still to chase is a working list with phone numbers and WeChat IDs ready to copy.
* **Student codes on linked applications**: where a prospect's application has published an enrolment, the prospect window shows the student's MSA or MSB code and opens their page from it.
* **The arrangement grid keeps to each branch's timetable**: day and time combinations the branch does not offer are shaded and closed, so a class can no longer be created at a weekend-only time by accident.
* **Super Admins can delete a regular application**: a delete button permanently removes an application and its edit history, for clearing test submissions, unless it has a published enrolment.


### Improvements

* **Plainer English on the September application form**: the introduction, the final-step notice and the make-up lesson note now read naturally in English instead of following the Chinese word for word.


### Bug Fixes

* **A waived materials fee stays waived everywhere**: the September surfaces that quietly added the MOP 100 materials fee back into the displayed fee now give the same answer as the rest.
* **Publishing offers only the branch's own tutors**: the tutor list when publishing a September enrolment now offers only tutors based at the selected branch.
* **The conversion page is readable in dark mode**: the coloured stage counts and the names in the chase list now brighten in dark mode.

## [2.0.100](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.99...v2.0.100) (2026-08-01)


### New Features

* **The session lists follow the clock**: the dashboard's Today's Sessions card and the sessions list now mark the current time, open at the current slot when viewing today, and offer a Now button to come back to it.
* **A gentle prompt towards lesson mode**: while one of a tutor's own lessons is running, the Lesson button on that slot carries a pulsing dot, with a one-off hint suggesting lesson mode.


### Bug Fixes

* **Jumping to a time slot lands properly**: a link pointing at a time slot now brings the heading fully into view instead of leaving it under the toolbar.
* **The September application form no longer spins forever**: a parent who is not signed in now opens the September form and its status page directly, the same way as the summer form.

## [2.0.99](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.98...v2.0.99) (2026-08-01)


### New Features

* **A September regular course application form**: parents can apply for the September regular course online the same way as for the summer course, in Chinese or English, with full class times shown as full and a status page after submitting. It opens on 3 August 2026 and closes on 30 September 2026.
* **The 2026 Back to School new student offer**: a student who has never attended any MathConcept centre saves MOP 400 on their first September enrolment, MOP 300 off the tuition and the MOP 100 materials fee waived, with a desk calendar included. It appears from 12 August, the day the campaign begins.
* **September enrolments do not collect the materials fee**: nobody joining in the September intake is charged the MOP 100 materials fee, and enrolments outside the intake are unchanged.
* **Arranging the September intake**: a new arrangement page places applications into class times for each branch, showing the seats left on every slot, with filters by grade, language stream, tutor and space, bulk handling, and the fee message prepared from the same place.
* **Following P6 students into the September intake**: the prospects page tracks students finishing primary through to their September application, and a conversion page shows how many went on to apply, by branch and by centre.
* **Filters on the summer arrangement grid**: the summer arrangement page can be narrowed by grade, course type, tutor and whether a class still has space.


### Improvements

* **A tidier course settings editor**: the summer course settings no longer offer an open days caption for each branch, which nothing ever displayed and which could disagree with the days actually set.

## [2.0.98](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.97...v2.0.98) (2026-07-30)


### New Features

* **Filter sessions by summer class**: during the summer course the session pages gain a Summer button that narrows every view by class grade, by Type A or Type B, and by lesson number, offering only the values actually on screen.


### Bug Fixes

* **Status and tutor filters now appear in the day and month views**: both filters now show in all four views, so sessions can no longer be hidden with nothing on screen to explain why.
* **A tidier Aged Pending Make-ups view**: opening it from the notification bell now shows only the controls that list can use, keeping the tutor filter and dropping the rest.

## [2.0.97](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.96...v2.0.97) (2026-07-28)


### Bug Fixes

* **Terminated students no longer treats the summer break as leaving**: the quarter running into the summer course is now measured up to the day regular lessons pause, and students who finished in the four weeks before it are reviewed in the following quarter instead.

## [2.0.96](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.95...v2.0.96) (2026-07-17)


### Bug Fixes

* **Copy Fee Message works for summer enrolments**: the button in the popover, the detail window and zen mode now copies a proper summer fee message, including the discount tier and any attached coupon.

## [2.0.95](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.94...v2.0.95) (2026-07-17)


### New Features

* **Tidier session lists on student and enrolment pages**: a new Hide Cancelled & Make-up Booked button puts away the lessons that already have a make-up booked, so the planned lesson numbers read cleanly, and it remembers being on.


### Bug Fixes

* **Summer fee messages include discount coupons**: a coupon attached to a summer enrolment now comes off the total in the fee message, the application details, the overdue payments page and the revenue figures.
* **Mark Sent and Confirm Payment on summer enrolment pages**: a published summer enrolment now offers both buttons under its fee message, so payment no longer has to go through the edit form.
* **Summer sessions with the same tutor and time group under one divider**: a summer make-up and another summer session with the same tutor and time now sit under a single class divider instead of two.
* **Tutors can change lesson numbers on other tutors' sessions**: changing or clearing the lesson number on another tutor's session now saves, which helps when arranging make-ups for their students. Other session details still need the owning tutor or an admin.

## [2.0.94](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.93...v2.0.94) (2026-07-15)


### Bug Fixes

* **Summer deadlines on the overdue payments page**: the Deadline column now shows the deadline for the discount tier each summer enrolment is currently on, instead of one that has already passed.

## [2.0.93](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.92...v2.0.93) (2026-07-15)


### New Features

* **Bulk assign follows each student's own lesson**: the summer materials panel now gives each student the materials for their own lesson rather than the majority lesson's chapter, and shows how the class splits before anything is saved.
* **Lesson number badges in lesson mode**: the student list, the Files view and the student picker all show each student's lesson number badge, editable in place.

## [2.0.92](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.91...v2.0.92) (2026-07-14)


### New Features

* **Lesson numbers go up to 10**: the lesson number badge on the session pages now accepts numbers from 1 to 10 instead of 1 to 8. The summer arrangement page is unchanged and continues to follow each course's own lesson count.


### Bug Fixes

* **Duplicate lesson number warnings can be answered**: changing a lesson number to one the student already holds now opens a dialog offering to save anyway, instead of blocking with an error.

## [2.0.91](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.90...v2.0.91) (2026-07-12)


### New Features

* **Stronger AI maths solving**: step-by-step solutions and variant questions now use an upgraded AI model with much stronger maths reasoning. Occasional blank responses are retried automatically and mathematical notation displays more consistently.


### Bug Fixes

* **Worksheet OCR and progress insights work again**: the AI model behind worksheet imports and progress insights was retired by its provider, which stopped both features from working. They now run on its replacement.
* **Rescheduled summer sessions can be reverted after publish**: publishing now records Scheduled as the status to return to, so Undo works on these sessions, and the ones already published have been repaired.

## [2.0.90](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.89...v2.0.90) (2026-07-05)


### Bug Fixes

* **Extension requests page shows recent requests again**: the Approved, Rejected and All tabs were quietly cutting off the newest entries once a tab held more than 200 requests, so recent requests never appeared. The latest requests are now always included.
* **Debug panel pages for Extension Requests and Planned Reschedules open again**: both pages failed on a sort field that does not exist, and the panel now falls back to a safe order.

## [2.0.89](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.88...v2.0.89) (2026-07-05)


### Bug Fixes

* **Summer sessions can be rescheduled without a deadline extension**: moving a summer session or booking a summer make-up no longer asks for an approved extension against a regular enrolment that has already ended.
* **Summer scheduling runs to 31 August**: summer sessions and make-ups can be placed on any date up to 31 August. Dates from 1 September onwards are blocked with a clear message, and Super Admins can still override when needed.
* **Make-up calendar warnings now follow the summer rules**: the calendar no longer shows amber enrolment deadline warnings on a summer make-up, and marks dates past 31 August in red instead.

## [2.0.88](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.87...v2.0.88) (2026-07-05)


### Bug Fixes

* **Grades show correctly now the summer course has started**: students show at their new level across the app, such as Pre-F1E for a student entering F1, instead of the previous year's grade.
* **Summer pages no longer overshoot the grade**: summer application and arrangement pages show the grade the student is preparing for, such as "F1E", without any "Pre-" prefix. Previously some badges showed one grade too high.
* **Badge colours follow the shown grade**: a badge reading "Pre-F1E" now uses the same colour as F1E, so grade colours stay consistent wherever the new level appears.

## [2.0.87](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.86...v2.0.87) (2026-07-02)


### New Features

* **Summer classes are grouped under class headings on the sessions page**: sessions from the same summer class now sit under a heading naming its grade and type, such as F1 · Type A, with a compact chip in the day and week views.
* **Make-up students appear with the class they join**: a summer make-up is grouped under the class actually being taught at that day and time, so each class reads as one group.
* **Rescheduled summer sessions keep their lesson number**: once a make-up is booked, the original session shows its lesson number in a faded badge borrowed from the make-up.

## [2.0.86](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.85...v2.0.86) (2026-07-02)


### New Features

* **Summer make-up suggestions now match by lesson number**: suggestions favour classes teaching the lesson the student missed, each slot showing which lesson its class is on and how many classmates are on it.
* **Lesson numbers are shown throughout make-up scheduling**: the lesson number now appears on the session summary, beside each student in a suggested slot, in the day picker and in the slot preview.
* **Copy a time slot to share with parents**: suggested slots and the day picker time headings now have a copy button that copies the slot as text such as "6/7 (Mon) 18:00-19:30", ready to paste into a message to parents before confirming a booking.

## [2.0.85](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.84...v2.0.85) (2026-06-28)


### New Features

* **Enrolment fee shown on the overdue payments list and detail views**: each row now shows the enrolment's total fee, and its View button opens the details in a popover instead of navigating away.


### Bug Fixes

* **Each session's revenue now reflects the real enrolment fee for every type**: the amount counted towards tutor revenue is the fee actually paid after discount, divided by the lessons, so summer enrolments and promotions that scale with the lesson count are valued correctly.
* **Summer fees match the fee message for pinned tiers and buddy groups**: a pinned discount tier and the whole buddy group are now taken into account, so the displayed fee agrees with the fee message.
* **Coupons only reduce a fee once added to an enrolment**: holding an unused coupon no longer takes money off a quoted fee. Only a coupon applied to the enrolment as its discount does.

## [2.0.84](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.83...v2.0.84) (2026-06-26)


### Bug Fixes

* **Published summer applications are counted again in the revenue analytics**: a published application is now counted through its enrolment's payment status, so the branch receivable and collected totals are no longer undercounted.

## [2.0.83](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.82...v2.0.83) (2026-06-25)


### Bug Fixes

* **One-time enrolment fee messages list the right sessions**: the fee message and last lesson date are built from the enrolment's actual sessions, leaving out cancelled ones and any lesson whose make-up is already booked, so nothing is charged twice.

## [2.0.82](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.81...v2.0.82) (2026-06-20)


### Bug Fixes

* **Exam revision make-ups keep the original lesson's enrolment and payment status**: the make-up created for an exam revision slot now inherits the original lesson's enrolment and paid status, and the ones already affected have been corrected.

## [2.0.81](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.80...v2.0.81) (2026-06-18)


### Bug Fixes

* **Enrolment preview no longer flags rescheduled slots as conflicts**: a slot the student has already rescheduled away from no longer counts as a conflict, because they are attending the make-up on another day.

## [2.0.80](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.79...v2.0.80) (2026-06-18)


### New Features

* **Summer materials now cover F4**: F4 summer worksheets are now available across the courseware pages, lesson mode, and exercise assignment, the same way F1 to F3 materials already are.

## [2.0.79](https://github.com/kenny1934/tutoring-management-system/compare/v2.0.78...v2.0.79) (2026-06-18)


### Bug Fixes

* **Correct summer materials for students moving up a grade**: summer worksheets now match the grade a student is about to enter in September rather than their current grade, so a student finishing P6 sees the new F1 materials all summer instead of none.

## [2.0.78](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.78) (2026-06-17)

### New Features

* **Adjust a summer discount tier before sending the fee message**: the office can pin a discount tier on a summer application before it is published, so the fee message quotes the right amount the first time.

### Bug Fixes

* **Clearer "discount forfeited" notices on summer applications**: the notice now appears only when a tier the applicant genuinely held was lost, not one they could never have qualified for.

## [2.0.77](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.77) (2026-06-15)

### New Features

* **"Extra Lessons" discount for one-off sessions**: a new Extra Lessons (per 2) discount takes $100 off every two extra lessons and applies to One-Time enrolments without the usual six-lesson minimum. Those enrolments can now hold more than one lesson, and their fee message lists each lesson's own date and time.

### Bug Fixes

* **Early Bird discount stays valid until the deadline ends**: the Early Bird tier now remains available through the end of the deadline day in Hong Kong time instead of expiring early, so a family paying on the final day keeps the discount.
* **Tighter protection for sensitive data**: prospect information is now reachable only through the secure site, closing a gap where some data could be opened by bypassing the normal sign-in. Everyday use is unchanged.

## [2.0.76](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.76) (2026-06-14)

### Bug Fixes

* **Early Bird protection now covers recording payments too**: recording a summer payment after the Early Bird deadline now pauses and asks on the Overdue Payments page and on the enrolment itself, and the payment date you enter is the one saved.

## [2.0.75](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.75) (2026-06-14)

### New Features

* **Branch revenue report on the Summer stats panel**: a new card shows summer fee collection for each branch by discount and by stage, alongside the value of July and August regular sessions.

### Bug Fixes

* **Early Bird discount is no longer dropped when a payment is recorded late**: marking a summer application paid after the deadline now asks first, so a family who paid on time keeps the discount when the office logs it a day or two later.

## [2.0.74](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.74) (2026-06-07)

### Bug Fixes

* **Make-up slots stay off the weekly slot grid**: one-off make-up slots now show only on the Calendar tab, instead of appearing in the weekly Slot Setup grid as if they repeated.
* **Summer courseware tables line up across grades**: the lesson column is the same width in every grade's table, and chapters beyond the scheduled lessons show their number in violet rather than an Extra chapter label.

## [2.0.73](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.73) (2026-06-07)

### New Features

* **Summer courseware at a glance for admins**: a new Summer Courseware page maps the teaching materials on the shared drive into a per-grade chapter table, flagging the files that do not follow the naming convention.
* **Summer materials built into lesson mode**: summer sessions show their chapter's materials in the lesson view, preselected by lesson number, and assigning gives each student their own language version with the answer key linked.
* **Bilingual side-by-side worksheets without the manual merge**: the parallel version of a worksheet is composed on the fly from the Chinese and English PDFs, with the pre-made file from the drive as a backup.
* **Summer course folder in the courseware browser**: the Browse tab pins a Summer Course entry at the top while summer materials are available, where Assign and Import work as they do for any other PDF.

### Bug Fixes

* **Courseware pages fit phone screens properly**: the chapter table keeps the lesson number in view while scrolling sideways, the PDF preview takes over the screen on phones, and buttons no longer hide behind the browser bar.
* **Chapter dropdowns are readable again**: the chapter pickers in lesson mode and the exercise dialogs showed light text on a grey list; the options now use a solid background in both light and dark mode.

## [2.0.72](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.72) (2026-06-06)

### New Features

* **Summer unavailable dates show up when arranging make-ups**: the dates a parent flagged on their summer application now show on the enrollment and at the top of the Schedule Make-up dialog.

### Bug Fixes

* **Summer enrollment label uses a consistent colour**: the Summer type badge on a student's enrollment list and in the enrollment popover now appears in orange to match the enrollment detail page, instead of the green used for regular enrollments.

## [2.0.71](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.71) (2026-06-04)

### Bug Fixes

* **School suggestions can be picked with the keyboard**: the school field's suggestion list now takes the arrow keys, Enter to choose and Escape to dismiss, on the students page, the profile edit form and the Add Student dialog.
* **Tutor profile reads better on phones**: the tutor detail page is more responsive on small screens, and the tutor header stays on a single row so a long email address truncates cleanly instead of stretching the card taller.
* **Command palette stays closed on the login page**: the quick command palette no longer opens before you have signed in.
* **Filter toolbars stay pinned while scrolling**: the toolbar holding the search and filters at the top of the Students and Courseware pages now stays fixed in place as you scroll the list, instead of scrolling out of view.

## [2.0.70](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.70) (2026-05-30)

### New Features

* **Tutor management page with detailed profiles**: a new Tutors page under Admin lists every tutor by location, role and status, and each profile shows their photo, contact details and this month's salary.
* **Searchable roster, quick stats, and a weekly agenda on each profile**: the profile lists the tutor's active students with search and sorting, a quick-stats panel, a clickable weekly heatmap that filters the roster, and a This Week card grouping their sessions by day.
* **Admins can schedule make-ups on holidays**: an admin can pick a holiday in the Schedule Make-up dialog and book on it, with an override notice naming the holiday. Tutors and read-only roles stay blocked.
* **Admins can create exam revision slots on holidays**: the Create Revision Slot dialog flags a holiday and lets an admin proceed, after which anyone can enroll students into that slot.
* **Handover banner now shows the primary student's branch id and name**: the banner and the first-lesson note now name the originating student, such as MCP-1023, and stay visible even when no handover notes were left.
* **Jump to a tutor's profile from anywhere their name appears**: for admins, tutor names are clickable across the app and open that tutor's profile. Read-only and tutor accounts keep seeing plain names.

### Bug Fixes

* **Tutor lists sort by name, not by title**: the Tutors roster now orders tutors by their actual name instead of their "Mr", "Ms", or "Mrs" title, so a tutor sorts under their first name rather than bunching together under the title.
* **Session completion ring no longer crowds its count**: the small progress ring in the today's sessions header had its number touching the edge of the ring at that size; the figures now sit cleanly inside.

## [2.0.69](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.69) (2026-05-29)

### Bug Fixes

* **Discounts no longer apply to enrollments under 6 lessons**: any discount or coupon now requires at least 6 lessons, so the picker is disabled below that and the fee message never shows one.
* **Number of Lessons field can be cleared and retyped**: the lesson count no longer snaps back to 1 while you are typing. An empty field falls back to 1 only when you click away.

## [2.0.68](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.68) (2026-05-16)

### Bug Fixes

* **Editing both info cards on a student profile no longer loses one of the edits**: Personal Info and Academic Info each keep their own draft now, so saving one no longer discards the edits in progress on the other.

## [2.0.67](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.67) (2026-05-12)

### New Features

* **Confirm placement and move lessons from the application detail modal**: a Confirm placement button scoped to one application flips its tentative sessions to Confirmed, and each session row gains a Move action for picking a new date, time and tutor.
* **Time inputs use the summer config's preset slots**: the Move popover and the Create Make-up Slot modal now offer the summer time slots as a dropdown, with a toggle for a one-off custom time.
* **Publish-status filter on Applications and Arrangement**: a filter on both pages narrows the list to Published, Unpublished or All, with a Ready to publish preset for the paid applicants still waiting.
* **Persistent hint under the Publish button**: the application detail modal now spells out what publishing actually does before you click it.

### Bug Fixes

* **Rescheduled lessons no longer falsely block publish**: an application with a Rescheduled - Pending Make-up placement can now be published, carrying that status into the live enrollment.
* **Publish refuses when a placement has no tutor**: publishing now refuses up front and points to the Arrangement page's Slot Setup tab, instead of creating an enrollment with no tutor.
* **Move preserves the lesson number on a new Make-up Slot**: moving L6 onto a freshly-created Make-up Slot used to render as "L-" because the new slot's lesson had no default number. The session now keeps the original lesson number through the move.

## [2.0.66](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.66) (2026-05-09)

### New Features

* **Annual grade auto-progression**: stored grades advance one step every 1 September, and through the transition window the badge shows Pre-Fx so tutors see next term's curriculum without the value changing early.
* **Copy past and all session dates from a student page**: the Copy pill in the Sessions tab now offers Past and All alongside Upcoming, with the session status beside each past date.

### Bug Fixes

* **Tutor-scoped features now follow the logged-in user**: proposals, memos, exam enrollment audit trails and the revision slot's default tutor now read the logged-in user rather than a hardcoded lookup.
* **Create student from a summer application prefills the right branch**: the Create new student dialog now seeds the home location from the application's preferred branch (MSA or MSB) instead of the sidebar's current filter. The dropdown stays editable.
* **Courseware tab no longer crashes when grouped by PDF**: the student detail Courseware tab's "Group by PDF" view was throwing a ReferenceError on render. The shared display-name helper is now wired up correctly.

## [2.0.65](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.65) (2026-05-09)

### New Features

* **P6 handover note follows the student**: the note the primary branch tutor wrote now shows on the session popover at the student's first lesson, and lives permanently on their Profile tab.
* **Admin-only grades on summer config**: a grade can be hidden from the public application form while staying selectable inside the admin pages. F4 ships that way.
* **Linked prospect badge on summer applications**: the card and the detail modal show a from P6 prospect badge beside the linked student badge, so the primary branch origin is visible without leaving the page.
* **Added-at timestamp on waitlist entries**: opening a waitlist entry now shows when (and by whom) it was added, right under the modal title.
* **Exited buddy members sink to the bottom**: Withdrawn and Rejected members now sort to the bottom of the buddy list, below a divider and struck through.

### Bug Fixes

* **Receipt code stays attached after linking a P6 prospect**: linking a student no longer overwrites the verified branch origin, so the 26SummerMC receipt code stays valid, and the rows already affected have been repaired.
* **Summer config save no longer wipes receipt codes and pricing extras**: saving the Summer Config now merges the pricing keys instead of replacing the whole block, so receipt codes, academic year dates and promo settings survive a Discounts edit.
* **Buddy people-meter ignores closed applications**: the buddy count on the application card now excludes Withdrawn and Rejected entries, matching the discount math and the buddy tracker.
* **Sidebar nav no longer shows a literal "0"**: nav items with a zero count (Waitlist, Extensions, etc.) stop rendering "0" next to the label.

## [2.0.64](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.64) (2026-04-27)

### New Features

* **Tutor x month revenue table**: a new Table view on the Revenue page shows every tutor as a row and the year's months as columns, shaded by session revenue, with a crown on each month's top earner.
* **Sort and filter the matrix**: click any column header to sort by that month, by year total, or by tutor first name; the sort persists in the URL. A small filter box narrows the rows to a tutor name search.
* **Tutor filter for the dashboard charts**: admins, super admins, and supervisors get a tutor selector above the Grade and School distribution charts that narrows both to one tutor at a time. Tutors in My View see only their own students automatically.
* **Grade chart split by language stream**: a Languages toggle breaks each grade into its C and E parts, stacked in the bar view and as separate slices in the donut and radial views.
* **Click a chart slice to jump to the matching students**: clicking a grade, school or stream segment opens the students list filtered to it, with the filters shown as clearable chips.
* **Copy chart data as a table**: a copy button on each chart header puts the rows on the clipboard as a tab-separated table, ready to paste into Sheets or Excel.
* **Session plan cap on summer placements**: dragging a student into a slot now refuses to overshoot their paid lesson count, with a Placed N/N badge on the application and each option's resulting total previewed.
* **Summer Course sidebar status**: the Summer Course nav shows a green Open pill while applications are being taken, replaced by an orange count of the ones still to work through.

### Bug Fixes

* **Supervisors can browse all summer admin tabs**: Applications, Arrangement, Prospects and Config open read-only for Supervisors instead of denying access, with the write controls hidden.
* **Readable section labels on the dashboard and Progress drawer**: the Filter charts tag and the Overview / History row now sit on a paper card, so the text no longer washes into the background in light mode.
* **Half-placement option label no longer assumes Type A**: the slot placement dialog's half option now reads "4 lessons" instead of "First 4 lessons", since slot type A or B determines whether those four sessions fall in the early or late half of the term.

## [2.0.63](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.63) (2026-04-26)

### New Features

* **Smarter leave day calculation**: the leave calendar tints public holidays and names them, and filing leave now excludes holidays and your own days off, so a 5-day request over Labour Day and a Sunday submits as 3.

## [2.0.62](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.62) (2026-04-25)

### New Features

* **Receipt code suggestion on application modals**: the Fee section of the application detail modal now proposes a receipt code with a copy button next to it, matching the existing discount-code copy flow.
* **Discount tier and receipt code breakdowns on applications stats**: the applications stats view now shows how applications break down by discount tier and by receipt code, alongside the existing strips.
* **Grade mismatch warning on placement**: dropping a student into a slot whose grade doesn't match the student's grade prompts for confirmation before placing, so mixed-grade assignments stay intentional.

### Performance

* **Snappier arrangement page**: skeleton placeholders cover the loading windows, polling pauses on tabs you are not viewing, and the grid only redraws the cells whose state actually changed.

## [2.0.61](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.61) (2026-04-24)

### New Features

* **Slot cards auto-sort**: slot cards in each cell follow one order, grade then course type then tutor, and freeze while the pointer is over a cell so nothing shuffles under your edits.
* **Withdrawn and Rejected applications fade back**: closed applications render at reduced opacity in the applications list so they recede in the default view, and their detail modal shows a sticky banner at the top announcing the closed state.
* **Sticky toolbar and headers on arrangement tabs**: the filter/toolbar row stays pinned while scrolling on the slot grid, calendar, and students table; the calendar gets sticky date headers and the students table gets a sticky header row.
* **Quarterly report totals match the Terminated Students page**: the opening, closing, termination and transfer figures now come from the same query as the web page, and the Reasons tab exports the category, reason and count.
* **Location totals on the Term Rate tab**: the quarterly report writes location-wide Opening and Terminated counts de-duplicated across tutors, so a student placed with two tutors counts twice per-tutor but only once at the location.

### Bug Fixes

* **Arrangement sidebar card clicks**: clicks on unassigned student cards now open the detail modal consistently, even when the pointer twitches slightly or you click on a pill or status dot.
* **Slot capacity counts rescheduled first lessons**: students whose first lesson is already rescheduled now count against slot capacity, so the arrangement grid stops over-accepting placements.
* **Buddy detail opens from applications modal**: clicking a buddy member in the detail modal now opens their application even when they're filtered out of the current list. Previously the modal went blank.
* **Prospect auto-link across phone country codes**: auto-link now normalizes HK/Macau country-code prefixes before comparing, and compact names score correctly against fuller forms that contain the same name tokens.
* **Prospect auto-link skips closed applications**: Withdrawn and Rejected applications are no longer scanned as match candidates, so dead apps can't auto-link on a phone match.

### Performance

* **Instant slot card create and edit**: creating a slot or editing its grade, type, tutor, label, or max now updates the grid immediately while the server request settles in the background. Edits also trigger half as many downstream refreshes.

## [2.0.60](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.60) (2026-04-23)

### New Features

* **All-staff leave balances for admins**: new "All Staff" tab in the Leave quick-link shows every active staff's Annual, OC, Birthday, and Sick Leave remaining, with search and branch scoping from the sidebar location picker
* **Supervisors can open the ARK dashboard**: the leave/HR quick-link now works for Supervisor accounts, auto-provisioning them on first visit to ARK
* **Supervisor-tailored Leave quick-link**: Supervisors see Review, Calendar, and All Staff tabs (defaulting to Review), and the ARK footer link for admins and Supervisors now opens straight to the matching tab in ARK

### Bug Fixes

* **Missing entries on unchecked attendance**: tutors (and anyone with a location filter) now see the unchecked sessions that the notification bell was counting
* **Termination rate precision**: term rate percentages on the Terminated Students page now round to true two decimal places (e.g. 6.67% instead of 6.70% for 5/75)
* **Message stream no longer pins database connections**: long-lived message tabs used to each hold a database connection open for the life of the tab, which could saturate the pool and trigger app-wide slowdowns or 503s during busy periods
* **Withdrawn apps hidden in demand view**: clicking a slot minibar to switch the side panel into Demand now drops Withdrawn, Rejected, and Waitlisted applications, matching what the Incomplete panel already shows

## [2.0.59](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.59) (2026-04-23)

### New Features

* **Arrangement workflow status chips**: quick chips at the top of the arrangement page filter by All, Unplaced, Incomplete, Placement Offered, or Confirmed, with a panel toggle so the incomplete side list matches the same cut
* **Workflow status icons on placed rows**: small icons next to placed students show at a glance who still needs a fee message, needs confirmation, or is fully done
* **Global student search on the arrangement page**: type a name or CSM student ID in the page header and jump straight to that student's slot, falling back to the calendar if they're still unplaced
* **Students tab filter rework**: filters on the Students tab now match the arrangement page vocabulary (location, grade, buddy state, workflow status) with cleaner chips and a dedicated search
* **Applications search by linked student ID**: the applications list and unassigned side panel now match on CSM student ID in addition to name
* **Smarter prospect link suggestions**: fuzzy-name matching catches typos and reordered characters, and already-linked applications are skipped so suggestions only show genuine candidates

### Bug Fixes

* **Marketing snapshot card on mobile**: shrunk padding, hid the long description, and shortened the button label so the card no longer dominates the stats view on narrow screens
* **Demand-bar click filter restored**: clicking a grade bar on the slot grid now correctly filters the side panel by day and time slot again
* **Rescheduled placement delete**: renamed the calendar action to "Reschedule" and let admins delete an already-rescheduled placement without having to revert it first
* **Placement dot alignment**: dots in the placement strip now line up with lesson numbers and reflect post-publish session status (cancelled, rescheduled)
* **Slot chip label wrap in admin edit pane**: long slot chips now wrap instead of forcing horizontal overflow
* **Prospect link popover**: right-aligned so it no longer clips off the right edge of narrow rows

## [2.0.58](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.58) (2026-04-22)

### New Features

* **Animal emojis on the dashboard**: the greeting at the top now has a chance to pick one of 36 new animal emojis

### Bug Fixes

* **Tutors can save termination reasons**: reason and category edits on the Terminated Students page no longer fail for non-admin users
* **Instant save feedback on Terminated Students**: saved reasons and categories now appear immediately instead of briefly reverting while the page reloads
* **Trials quicklink student names**: restored normal name size in the dashboard trials popover (was accidentally shrunk to the dense summer-calendar size)

## [2.0.57](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.57) (2026-04-22)

### New Features

* **Lesson number editing on published summer sessions**: a lesson number can be edited in place from its badge on the session detail and popover, with per-student overrides that survive a reschedule and a guard against duplicates.
* **Ad-hoc Make-up Slots**: admins can spin up one-off slots off the weekly grid for rescheduled lessons; off-grid dates render as make-up cards on the arrangement calendar
* **Live session data on published applications**: the arrangement grid and application modal now read live session state after publish, so rescheduled, edited, and cancelled lessons show their current details instead of the frozen plan
* **Divergence cues and an eye icon on placement rows**: an orange pill marks the rows that have drifted from the original plan, and an eye icon opens the session detail popover so admins can act without leaving the calendar.
* **Placement rows jump to calendar**: clicking a placement row in the application modal navigates to the matching week and branch, expands the card, and rings the target student row
* **Delete placement post-publish**: remove a single published session from an application while keeping notes intact
* **Auto-suggest modal reorg**: cards collapsed by default with attention icons, sticky filter bar (search + quality chips + select-visible), a Ready-to-place section pre-selected up top, and a Needs-review section that auto-expands without pre-selection
* **Calendar density controls**: toggle day columns on slot setup and the arrangement grid to hide empty or unneeded days and reclaim horizontal space
* **Mixed-lesson indicators**: slot cards show a dot when students are on different lesson materials, and rows with divergent lesson numbers render their own L# badge
* **Linked CSM student chip on arrangement rows**: slot rows and calendar cards surface the matched CSM student identity alongside the applicant name

### Bug Fixes

* **Lesson-number cache staleness**: post-publish lesson number edits now propagate immediately across views instead of waiting for a refresh
* **Unpublished placement lookup**: calendar navigation now routes via the SummerLesson FK to avoid stale lookups
* **Auto-suggest sticky filter bar**: filter bar now sits flush at the top of the scroll area when scrolled

## [2.0.56](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.56) (2026-04-11)

### New Features

* **Arrangement page revamp**: enriched incomplete panel cards (branch chips, buddy dots, status indicators, placement dot strip), bulk session confirm (per-slot and per-location), student table to calendar navigation, buddy co-placement hints during drag
* **Demand sparklines**: slot grid cells show per-grade mini stacked bars (solid = 1st pref, light = 2nd pref) with global max relative sizing for cross-cell comparison
* **Clickable demand bars**: click a grade bar to filter the side panel to students who chose that slot as their 1st or 2nd preference, fetching all applications (not just unplaced)
* **Auto-suggest partial placement**: algorithm now tolerates up to 2 date-excluded lessons, creating them as "Rescheduled - Pending Make-up" on the original date. Offers an "Option B" with make-ups when non-preferred slots would otherwise be used
* **Calendar overlay in auto-suggest**: the date constraint panel now shows colored dots on suggested lesson dates, with hollow circles for pending make-up lessons
* **Rescheduled session styling**: sessions with "Rescheduled - Pending Make-up" status display with orange tint, AlertTriangle icon, and strikethrough across calendar, slot cards, and detail modal (matching the sessions page convention)

### Bug Fixes

* **Status flow correction**: placing sessions now bumps application status from Submitted to Under Review (not Placement Offered). Placement Offered and Confirmed are reserved for when fee messages are sent to parents
* **Auto-suggest for MSB**: fixed auto-suggest returning no results for MSB location by generating lessons before running the algorithm
* **Rescheduled sessions excluded from capacity**: sessions marked as rescheduled no longer count towards slot or lesson capacity, freeing seats for other students

## [2.0.55](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.55) (2026-04-11)

### New Features

* **Wolfram Alpha query panel**: tutors can query Wolfram Alpha directly during lessons via a slide-in panel (press W or click the Sigma button in the header). Results display as a zoomable image with click-to-zoom via the existing lightbox
* **Math keyboard input**: toggle the f(x) button to switch from plain text to a MathLive math keyboard for structured input. LaTeX is automatically converted to Wolfram-compatible syntax
* **Query caching**: repeated queries return instantly from a 24-hour backend cache (200 entry cap), saving API quota. Cached results show a green "Cached result" badge
* **Persistent query history**: past queries are saved in localStorage (up to 30) and persist across sessions. A collapsible history panel lets tutors browse and re-run previous queries
* **Cross-user Google Drive title fetch**: URL exercise titles now fetch for Google Docs stored in any workspace user's Drive, not only the admin's.
* **Google Docs sharing hint**: lesson mode shows a "Can't see the file? Ask the owner to share it with you" hint below Google Docs iframes

## [2.0.54](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.54) (2026-04-11)

### New Features

* **Expanded URL exercise support**: embed YouTube videos, Desmos graphs, GeoGebra tools, PhET simulations, Kahoot quizzes, and Polypad manipulatives directly in lesson mode. Wayground and Mathigon links open in a new tab
* **Type badges**: URL exercises now show colored badges (Video, Math, Sim, Quiz, Slides, Doc, Link) in lesson sidebars, student courseware tab, recap items, and exercise history
* **Resource directory**: a new "Browse Resources" dropdown in the exercise editor helps tutors discover educational platforms with link format guidance and embed behavior hints
* **Editable URL titles**: the auto-fetched title field is now an editable input, so tutors can manually name exercises when auto-fetch fails or returns a bad name
* **Title fetch for any URL**: pasting a YouTube, Desmos, PhET, or any HTTPS link auto-fetches the page title. YouTube uses the oEmbed API for reliability
* **YouTube thumbnail preview**: hovering over the YouTube icon in lesson sidebars and exercise modals shows a thumbnail preview of the video
* **Iframe embed code paste**: pasting an iframe embed code (e.g., from Polypad) automatically extracts the URL

### Bug Fixes

* **Duplicate key warning**: fixed React key collision in SessionDetailPopover when URL exercises have no PDF name

## [2.0.53](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.53) (2026-04-11)

### New Features

* **URL exercises**: tutors can paste Google Slides, Docs or Sheets links as classwork or homework alongside PDFs, and they show as an embedded frame in lesson mode.
* **Auto-fetch URL titles**: a pasted Google link now shows its real title everywhere, in the exercise modals, lesson sidebars, session detail, the courseware tab, reports and history.

## [2.0.52](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.52) (2026-04-10)

### Bug Fixes

* **Ghost sessions respect tutor filter**: proposed make-up sessions on the Sessions page and Today's Sessions card now correctly hide when a tutor filter is active, instead of showing every pending proposal regardless of tutor

### New Features

* **Kahoot! in Tools quicklinks**: added a direct link to Kahoot in the dashboard Tools dropdown for quick access during lessons

## [2.0.51](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.51) (2026-04-10)

### Improvements

* **Placement details in the application card**: a placed student now shows a progress strip with the date range, coloured status dots and a placed out of total count, instead of repeating the same day and time for every lesson.
* **Placement details in the detail modal**: each session row now shows the actual lesson date, day, start time, class grade, tutor name, and current slot capacity, matching the information density of the arrangements page
* **Consistent section icons**: the card and detail modal now use the same icons for schedule preferences and placement sections

## [2.0.50](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.50) (2026-04-10)

### New Features

* **A unified toolbar on summer applications**: the stats, filters and count strips collapse into one row with Status, Arrange and More menus, and location moves to the page header as a scope like the other admin pages.
* **Buddy board view**: an alternate view of the applications page groups members by buddy code and buckets the groups by how close they are to the next discount tier.
* **Branch origin filter**: new More-menu filter that scopes the list to a specific branch (MAC, MSA, …) or shows only "New" applicants with no linked student or claim
* **Link suggestions modal**: single admin modal that surfaces both auto-match candidates (Primary prospects) and duplicate-student candidates (Secondary branches) in one place, with per-row "Link this" inline actions and strict auto-link thresholds
* **Fee breakdown in the detail modal**: each applicant shows the discount code, the amount and the final fee, with a nudge when the group is one member short of the next tier.
* **Prospects auto-match preview**: clicking Auto-Match now opens a dry-run preview showing exactly which prospects would link and which would be skipped (with reason and conflicting rows); ambiguous cases can be resolved inline
* **Prospects WeChat filter**: filter the admin prospects list by whether the imported contact data already has a WeChat handle, so "who can I message right now" is one click
* **Filter-aware branch pills**: the top branch pills on the prospects page now re-count themselves against the active filters, so selecting "Has WeChat" (or any other filter) shows the per-branch counts for that slice

### Improvements

* **A redesigned card on the applications list**: the card now has a clearer hierarchy, inline status editing, a buddy meter that counts real group members plus declared siblings, and the originating centre on a chip.
* **Smoother scrolling on the applications list**: a long list no longer stutters as you scroll it.
* **URL-synced filters**: toolbar state (filters, sort, view, preset) round-trips through the URL so links and page reloads restore the exact view
* **Unsaved-changes guard**: the detail modal now prompts before discarding edits when cancelling, closing, hitting Escape, or navigating prev/next
* **More dropdown on narrow screens**: portal-based positioning clamps the menu to the viewport so it no longer overflows on small screens
* **Duplicate-check hints in student search**: combined name/phone match reasons into a single row so the strongest signal is always visible

### Fixes

* **Prospects branch-count pills missing totals**: the admin stats endpoint was being shadowed by the single-prospect fetch route and silently returning 422, so pill counts went blank. Route order fixed
* **The linked-student warning belongs to the applicant you opened**: stepping through applications no longer flashes the previous applicant's warning on the new one.
* **The prospect window's close button**: it now gives visual feedback, and the linked application's status badge shows the right state.

## [2.0.49](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.49) (2026-04-08)

### Fixes

* **The summer form no longer skips its confirmation step**: clicking Next on step 4 could occasionally jump straight to the success page, so the navigation buttons now unmount fully between steps and submit can never fire by accident.
* **The dashboard leave quicklink follows impersonation**: an admin impersonating a tutor now sees that tutor's balance rather than their own.

## [2.0.48](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.48) (2026-04-07)

### New Features

* **Summer application self-edit**: an applicant can edit their submitted form from the status page while it is still in Submitted, after which it locks with a banner asking them to contact staff.
* **Summer edit audit trail**: every change (applicant or admin) is captured in a per-field history visible in the admin detail modal, with timestamps, editor name, and old → new values
* **Admin application detail editing**: an Edit details toggle in the admin modal turns the identity, schedule and preference fields into inline editors, and moving an application out of Submitted now asks for confirmation.
* **Sibling declaration on buddy groups**: a secondary applicant with a younger sibling applying at a Primary branch can declare them on the buddy group, and once an admin confirms it the sibling counts towards the 3-person discount.
* **Draft autosave**: apply form now saves in-progress data to the browser so a reload or accidental close doesn't wipe half-filled applications; a "Resume draft?" banner offers to restore it
* **Unload warning**: the browser now asks for confirmation before leaving the apply page with unsaved changes

### Improvements

* **One question about the student's background on the summer form**: whether they already study with us and which centre are now a single chip selector grouped by organisation, saving a tap.
* **A tap-a-slot grid on the summer form**: class times are picked from a day-by-time grid instead of four cascading dropdowns, tapping once for first preference and again for second.
* **Pill selection on the summer form**: the centre, grade, frequency and buddy chips no longer shift the layout when picked, since selection now shows in colour alone.
* **The WeChat brand icon on the summer form**: the WeChat ID field carries it on the apply form, the status page and the admin window.
* **Phone format tolerance**: summer applicants can now enter their number with spaces, hyphens, or parentheses without issue; the status page accepts any format on lookup
* **Duplicate detection**: same parent can now submit multiple siblings (same phone, different student name); the duplicate check correctly blocks same-student resubmissions only
* **Capacity headroom**: raised submission, status, and self-edit rate limits to tolerate shared school or office wifi; Cloud Run backend and frontend now scale up to 3 instances for failover and burst capacity
* **Sibling verification in the admin window**: pending siblings show as chips with confirm and reject buttons, and each row is tagged with its branch.

### Fixes

* **Buddy cap race**: submitting with both a buddy code and a declared sibling now pre-flights capacity so the user gets the cap error before anything commits, instead of leaving the application saved with a confusing sibling error
* **Status page translation**: grade, language stream, and location now show their proper Chinese or English label based on the selected language, instead of the raw stored value
* **Admin config preview drift**: the admin form preview now stays automatically in sync with the real apply form as fields evolve

## [2.0.47](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.47) (2026-04-05)

### New Features

* **Waitlist**: track prospective students (New) and slot change requests with a searchable list view, bulk paste import, and filters by grade, type, and location
* **Waitlist timetable**: weekly grid overlay showing waitlist demand alongside enrolled students, with day-filter chips, cell heat tinting by occupancy, and collapsible tutor cards with capacity bars
* **Preferred tutor**: optional tutor preference per slot; entries appear inside the preferred tutor's timetable card with a "Waiting" section
* **Slot Change highlight**: collapsible card strip above the timetable showing current → preferred slot details; selecting an entry highlights the relevant tutor cards
* **Enrollment workflow**: link waitlist entries to students, schedule trials with a one-click prompt after student creation, and view enrollment details from the timetable

## [2.0.46](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.46) (2026-04-03)

### New Features

* **Copy All**: new toolbar button in the document editor copies all content (text, LaTeX math codes, and geometry diagram images) to the clipboard for easy export to other apps
* **Dual-format clipboard**: rich text targets (Google Docs, Word) receive formatted HTML with embedded images; plain text targets get text with `$LaTeX$` codes preserved

### Improvements

* **Responsive document toolbar**: History, Layout, and Copy All buttons collapse into an overflow menu on smaller screens to reduce crowding

## [2.0.45](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.45) (2026-04-02)

### New Features

* **ARK leave integration**: a leave dropdown on the dashboard carries balances, request filing and admin review, so the common tasks no longer mean switching to ARK.
* **Leave balances**: expandable rows showing entitlement, carry-over, adjustments, and remaining days with a visual bar
* **File leave & overtime**: compact forms for submitting leave requests (with time range for partial days) and overtime records directly from the dropdown
* **Admin leave review**: approve or reject pending leave requests inline with optional reviewer notes
* **Team leave calendar**: month-view calendar for admins showing who's on approved leave with colored dots per leave type

### Improvements

* **Dashboard dropdown styling**: warm paper-cream background with texture, stronger shadows, and darker borders across all quick-link dropdowns
* **Compact request cards**: two-line leave request cards with expandable detail (reason, reviewer, filed date)
* **Upcoming/History filter**: My Requests tab defaults to upcoming leave, with a toggle to view past and cancelled requests
* **Cancel approved leave**: cancel button available on both pending and approved requests (approved cancellation restores balance)
* **Notification bell**: pending leave request count shown for admins alongside other notification items

### Bug Fixes

* **Leave day count**: now counts all calendar days instead of skipping weekends
* **Dark mode contrast**: fixed approve/reject button text, select dropdown background, and footer divider visibility
* **Dropdown corner bleed**: hover states on footers and form headers no longer poke outside rounded containers
* **Proposed sessions location filter**: makeup proposal ghost sessions now correctly filter by branch location

## [2.0.44](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.44) (2026-04-01)

### New Features

* **Worksheet OCR import**: upload scanned PDF worksheets and automatically extract content into the document editor with math, tables, and bilingual support
* **Question extraction & AI processing**: split worksheets into individual questions, generate step-by-step solutions and variant questions with one click
* **Documents page redesign**: table view with variant tree, folder sidebar with drag-and-drop, preview pane, bulk operations, tag management, and keyboard navigation
* **Answer sections**: collapsible inline answers in the editor with a printable answer key page

### Improvements

* **Math editor LaTeX source mode**: toggle between the visual editor and raw LaTeX for direct source editing
* **Editor mobile responsiveness**: toolbar collapses on small screens with touch-friendly targets
* **Smart question detection**: works with both OCR-imported and manually created worksheets
* **Print answer key**: shows document name, clean text over watermark, avoids splitting entries across pages
* **Print reliability**: page layout recalculates after fonts load to prevent content overlapping footers

### Bug Fixes

* **Page layout sometimes got out of sync**: content near page boundaries could overlap footers until a browser refresh
* **Watermark too dark in print**: appeared much darker than the editor due to duplicate elements stacking
* **Security fixes**: stricter permission checks on write endpoints and safer handling of special characters in tag filters

## [2.0.43](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.43) (2026-03-27)

### New Features

* **PDF page navigation bar**: bottom bar with prev/next buttons and a page number input for jumping directly to any page in multi-page exercises

### Bug Fixes

* **PDF preview flickering**: reduced unnecessary re-renders in lesson mode PDF viewers that could cause both exercise and answer panes to flash on high-DPI displays or slower devices

## [2.0.42](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.42) (2026-03-26)

### New Features

* **Prospect page overhaul**: floating action button with direct-submit drawer, paste-to-table form with field validation, arrow key navigation in school autocomplete, urgency highlights on submitted table, and bulk operations

### Improvements

* **Rate limits increased**: higher thresholds for shared WiFi environments where multiple staff connect from the same IP

### Bug Fixes

* **Keyboard shortcuts after bulk rating**: shortcuts on the sessions page stopped responding after closing the bulk rate modal until clicking something with the mouse
* **Prospect drawer name**: fixed the drawer capturing a stale student name after edits

## [2.0.41](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.41) (2026-03-25)

### New Features

* **Bulk attendance actions**: the unchecked attendance page now supports selecting multiple sessions with checkboxes and marking them all as attended or no-show in one click

### Bug Fixes

* **Printing .doc files now works**: print buttons across the app (session detail, exercise modal, lesson mode) were silently failing for `.doc`/`.docx` exercises; they now correctly fetch the converted PDF from Shelv before printing
* **Tutors can now add CW/HW and rate any session**: previously, tutors could only assign exercises and rate sessions under their own name; now any tutor can collaborate on any session

## [2.0.40](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.40) (2026-03-23)

### New Features

* **Summer course system**: full application workflow: public bilingual apply form, admin config editor with drag-and-drop slot management, application review dashboard, and timetable arrangement grid
* **Session-based scheduling**: calendar view with week navigation, lesson capacity tracking, student lesson tables, and find-slot dialog for manual placement
* **Auto-suggest placement**: lesson-level algorithm with pair ordering, date constraints, tutor preferences, and single-student suggest from the unassigned panel
* **P6 prospect module**: primary-to-secondary student feeder list with smart paste-to-table input, bulk operations (select, delete, set intentions, CSV export), and PIN-gated branch access
* **Prospect subdomain**: `prospect.` subdomain routing via middleware for branch-specific access
* **Admin auto-match**: automatically links P6 prospects to summer applications by phone number and year

### Improvements

* **Security hardening**: rate limiting on all public endpoints, Pydantic Literal validation for enums, year-scoped queries, PIN brute-force protection

## [2.0.39](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.39) (2026-03-23)

### Bug Fixes

* **Answer path paste now auto-converts drive letters**: pasting a Windows path like `V:\folder\file.pdf` into the answer field now auto-converts it to the correct alias format, matching the behaviour of the exercise path input
* **Answer download shows missing count**: the bulk answer download button now shows how many answers were found vs missing, instead of silently skipping unfound files
* **Per-exercise answer open/download Shelv fallback**: the open and download buttons on individual answer rows now fall back to Shelv when the file isn't found locally
* **HK timezone for date calculations**: all backend date operations now use Hong Kong timezone consistently, preventing date mismatches around midnight
* **Legacy renewal check**: candidate enrollments are now included when checking legacy renewal status
* **Calendar sync crash**: fixed crash when detecting orphaned calendar events with exam revision slots, which caused "Failed to load calendar events" on the dashboard
* **Make-up button colour**: the Schedule Make-up button on the Pending Make-up page now uses teal to match the session detail page

### Improvements

* **Answer open/download shows progress**: the answer open and download buttons now show a spinner with progress text (e.g. "Trying local file…", "Searching Shelv…") instead of appearing to do nothing
* **"Download Answers" shows live status**: the bulk download answers button now shows what it's doing (e.g. "Searching 1/3…", "Downloading 2 answer(s)…")
* **Raw drive letter paths now resolve**: file paths like `V:\folder\file.pdf` can now be opened, downloaded, and printed directly without needing alias conversion first

## [2.0.38](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.38) (2026-03-20)

### Bug Fixes

* **Layout fix for modals and error pages**: fixed an issue where modals, dialogs, and full-page error messages appeared extremely narrow instead of their intended width
* **Extension deadline preview**: the "New Effective End Date" shown when adjusting extension weeks now matches the actual calculated date, including holiday adjustments
* **Sessions tab popover crash**: fixed an error when opening the enrollment detail popover from the sessions tab on a student page
* **Guest dashboard**: guests no longer see failed network requests for admin-only data on the dashboard
* **Notification bell**: notification icon stays properly aligned when dashboard stats are hidden for guests
* **Dropdown on mobile**: fixed dropdown menus going off-screen when opening upward on small screens

### Improvements

* **Answer search copies page range**: the answer search button now copies the exercise's page range (simple or complex) into the answer fields, instead of only filling the PDF path

## [2.0.37](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.37) (2026-03-19)

### New Features

* **ARK leave quick link**: dashboard "Leave Record" now links to ARK's leave management with the ARK brand icon, Google Sheet links kept as fallback during transition
* **Cross-app SSO**: clicking the ARK leave link passes a handoff token so you're automatically logged in without needing to re-authenticate

## [2.0.36](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.36) (2026-03-19)

### Bug Fixes

* **Custom page order preserved**: entering page ranges like "8-15,5-6,16-18" now keeps pages in that exact order when viewing, printing, and downloading, instead of sorting them numerically
* **Rate & Comment modal cancel button**: fixed confirmation dialog appearing behind the modal when discarding unsaved changes

## [2.0.35](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.35) (2026-03-18)

### Bug Fixes

* **Reschedule & make-up for other tutors**: tutors can now reschedule sessions, schedule make-ups, and cancel make-ups for any student, not just their own sessions
* **Sick leave & weather cancellation**: same fix applied to sick leave and weather cancelled actions
* **Undo/redo across tutors**: undo and redo status changes now work regardless of which tutor owns the session

### Improvements

* **Read-only role enforcement**: Guest and Supervisor accounts are now properly blocked from all session changes on the server side, not just hidden in the interface
* **11 new backend tests** covering cross-tutor actions, ownership restrictions on attendance, and read-only role access control

## [2.0.34](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.34) (2026-03-17)

### New Features

* **Skills radar chart**: add a configurable spider chart to progress reports showing 4-8 custom skill attributes scored 1-5; choose between numerical or labeled display; saved per student so scores carry over to future reports
* **Save & view reports**: save progress reports internally with a single click; access past reports from a new "History" button next to "Generate Report" with auto-generated labels and one-click open or delete
* **Reorderable report sections**: drag-and-drop section order in the report config modal; the custom order applies to the generated report, shared links, and saved reports
* **Date range moved to top**: date range is now the first option in the report config modal for faster access

### Bug Fixes

* **Share link creation**: fixed "Failed to create share link" error after deployment
* **Radar chart on mobile**: fixed chart not appearing on small screens
* **Report print timing**: fixed reports occasionally printing before all data finished loading
* **Radar chart display mode**: fixed score display preference (numerical vs labels) not being remembered between sessions
* **Concept map error feedback**: concept map now shows a message when AI generation fails instead of silently disappearing
* **Delete and revoke feedback**: fixed false "failed" error messages when deleting saved reports or revoking share links
* **Share link revoke**: revoke button now shows proper error feedback instead of failing silently

### Improvements

* **Faster report history loading**: optimized database query for listing saved reports
* **Instant delete**: deleting a saved report removes it from the list immediately without waiting for a server response
* **Radar label limits**: attribute names are capped to prevent layout overflow in print/PDF
* **28 new backend tests** covering radar chart configuration and saved reports

## [2.0.33](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.33) (2026-03-14)

### New Features

* **Shareable parent reports**: tutors can generate a secure link to share progress reports with parents; parents open the link in any browser without login, seeing the same HTML report with full charts and formatting
* **Reports subdomain**: shared reports are served from `reports.mathconceptsecondary.academy`, keeping the internal tool domain hidden from parents
* **Share link deduplication**: clicking "Share Link" multiple times within 5 minutes reuses the same link instead of creating duplicates

### Bug Fixes

* **Share link creation**: fixed "Failed to create share link" error caused by a missing database column; added migration for `student_id` on `report_shares`
* **Server stability**: fixed an issue where heavy usage could temporarily make the app unresponsive; the server now auto-recovers without manual intervention
* **AI insights reliability**: fixed an error that could occur when generating AI learning summaries under heavy load
* **Shared report date**: shared report links now show the original generation date instead of the date the parent opens it
* **Print charts**: charts in reports no longer collapse to blank when printing or saving as PDF
* **Expired share cleanup**: expired report links are automatically cleaned up, keeping the database tidy
* **Topic chip overflow**: long topic names in report chips are now truncated to prevent layout overflow
* **Share link revoke**: revoke button now surfaces errors and only clears the URL on success

### Improvements

* **Mobile-friendly reports**: shared report links now display properly on phones with responsive layout, stacked sections, and scrollable tables
* **Share link refresh**: re-sharing a report within the dedup window now updates the link with the latest report settings
* **Rate limiting**: public share links are rate-limited to prevent abuse
* **Test coverage**: added 37 new backend tests covering report shares and student progress endpoints

## [2.0.32](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.32) (2026-03-14)

### New Features

* **Student progress report**: a printable progress report opens from the student's progress drawer, with a configurable date range and two modes, internal for the full data and parent for a shareable summary.
* **AI learning summary**: generate a natural-language summary of student progress using Gemini, with concept map visualization; supports English and Traditional Chinese
* **Concept map**: interactive treemap of math concepts extracted from exercise filenames, categorized by topic (Algebra, Geometry, Trigonometry, etc.)
* **Report section toggles**: choose which sections to include in the report (attendance, rating, topics, tests, activity, enrollment, contacts); mode-aware toggles show/hide sections relevant to each report type
* **Test & exam timeline**: shows upcoming and past tests/exams matching the student's school and grade within the report period, with syllabus details

### Bug Fixes

* **Bulk print custom pages**: printing CW/HW in bulk now correctly uses custom page ranges (e.g. "pages 1,3,5-7") instead of ignoring them
* **Print fallback**: print buttons in lesson modes now properly search Shelv when a file isn't found locally
* **Session popover print**: individual and bulk print from the session detail popover now respects custom page ranges
* **Report print clipping**: fixed right-edge content being cut off when printing reports
* **Chinese proper nouns**: AI summaries in Traditional Chinese now preserve student and school names in their original form instead of transliterating

### Improvements

* **Print button feedback**: print buttons now show a spinner while working and display what's happening in the tooltip (e.g. "Searching by filename...")
* **Student ID layout**: student IDs (MSA-XXXX) in the lesson sidebar no longer wrap to a second line
* **File tab sorting**: students in the "by file" tab are now sorted to match the "by student" tab order
* **AI cost safeguards**: 30-second cooldown between AI generations, backend rate limit (5 calls/minute), and in-memory result caching (1-hour TTL) to prevent accidental overuse
* **AI context filtering**: unchecked report sections are excluded from the AI prompt context, so narratives only reference data the user chose to include
* **Report config modal**: report configuration moved from inline panel to a dedicated modal for cleaner UX; AI content section clearly separated from report sections

## [2.0.31](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.31) (2026-03-13)

### New Features

* **Student progress drawer**: expandable analytics panel in the student detail header showing attendance summary, performance rating trends, exercise breakdown, enrollment timeline, parent contact summary, and monthly activity charts
* **Trend delta badges**: 30-day vs previous 30-day attendance comparison and recent vs overall rating comparison with arrow indicators and tooltips explaining each metric
* **Clickable summary cards**: each metric card in the progress drawer navigates to the relevant tab (sessions, ratings, courseware, profile)

### Improvements

* **Optimized progress queries**: merged attendance trend calculation into a single SQL query instead of two separate round trips
* **Consistent badge colors**: enrollment type and contact method/type badges in the progress drawer now match the colors used in the Profile and Parent Contacts tabs
* **Enrollment timeline trimming**: shows 2 most recent enrollments with a "View all" link to the Profile tab

### Bug Fixes

* **Total sessions count**: progress drawer now correctly excludes rescheduled and cancelled sessions from the total
* **Recharts tooltip collision**: resolved build error from duplicate Tooltip import between Recharts and UI tooltip component
* **Loading skeleton**: added progress button placeholder and corrected tab count in the student detail loading state

## [2.0.30](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.30) (2026-03-12)

### Bug Fixes

* **Frontend version display**: fixed version number not updating in settings modal and "What's New" notifications
* **Health check**: endpoint now returns HTTP 503 when database is unreachable, so Cloud Run can route traffic away from unhealthy instances

### Improvements

* **Code cleanup**: consolidated duplicate logic, hardcoded values, and repeated database query patterns across backend and frontend
* **Batch operation performance**: batch mark-paid and mark-sent now load all enrollments in a single query instead of one per enrollment
* **Exam revision performance**: batch-resolve makeup session chain lookups instead of querying one-by-one
* **Zen mode performance**: memoized context providers to prevent unnecessary re-renders
* **Renewal check performance**: batch-query renewal and schedule overlap lookups instead of per-enrollment queries
* **Reduced unnecessary API calls**: disabled automatic refetch on window focus globally
* **Accessibility**: added screen reader labels to icon buttons and dialog attributes to modals
* **Dashboard & session list performance**: memoized attention card and proposed session components to reduce re-renders
* **Crash resilience**: added error boundaries around dashboard charts, document editor, inbox thread panel, courseware PDF preview, and termination charts so a crash in one component doesn't take down the whole page
* **Template delete safety**: added confirmation prompt before deleting message templates
* **Smaller Docker image**: replaced dev headers with runtime-only library in backend production image
* **Test coverage 5x increase**: the test suite grew from about 134 to 646 tests, covering fee calculation, scheduling, quarter boundaries, exam revision, revenue tiers and twenty more modules.

### Security

* **Messages router authentication**: all 39 messaging endpoints now require JWT authentication with tutor ownership verification, preventing unauthorized access via spoofed tutor_id parameters
* **Parent communications write protection**: POST, PUT, and DELETE endpoints now require authenticated non-read-only users
* **Exam revision slot protection**: slot update and delete endpoints now require JWT authentication
* **Document processing authentication**: PDF handwriting removal endpoints now require JWT authentication
* **Dashboard data protection**: stats, locations, active students, and activity feed endpoints now require authenticated users
* **Backend URL hardening**: moved Cloud Run backend URL from source code to environment variable
* **Security headers**: added Permissions-Policy (restricts camera, geolocation, payment) and Cross-Origin-Opener-Policy (Spectre protection)
* **Request logging**: all API requests now log method, path, status code, and duration for observability
* **Explicit Cloud Run settings**: memory, CPU, concurrency, and ingress now set explicitly in deploy config

## [2.0.29](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.29) (2026-03-12)

### New Features

* **Bulk exercise assignment in wide mode**: assign CW/HW to multiple students at once via student picker popover in the lesson wide mode sidebar (both by-student and by-file views)
* **Clipboard paste in bulk modal**: exercises copied from ExerciseModal (Ctrl+C) can now be pasted into BulkExerciseModal (Ctrl+V) with confirmation dialog and source student info
* **Multi-select bulk delete**: select multiple exercises via checkboxes and delete them all at once with an inline red confirmation banner; Alt+Backspace shortcut support
* **PDF dark mode**: toggle button on all PDF viewers inverts page colors for comfortable dark reading; persisted via localStorage across PdfPageViewer, PdfPreviewModal, and Zen viewers

### Bug Fixes

* **Nested button hydration error**: fixed Next.js hydration warning caused by a print button nested inside the exercise item button in the lesson sidebar

## [2.0.28](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.28) (2026-03-11)

### New Features

* **Select Attended sessions**: bulk-select attended sessions for CW/HW assignment and rating via new dropdown menus on both the sessions page and dashboard card; Ctrl+Shift+A now cycles through markable → attended → clear with toast feedback on each press
* **Lesson mode print buttons**: single lesson mode now has bulk CW/HW print dropdown and per-exercise print buttons in sidebar; wide lesson mode adds per-student CW/HW print buttons in Students grouping

### Improvements

* **Toast feedback on selection**: all select actions (markable, attended, per-slot) now show info toasts with count or "none found" message instead of failing silently
* **J/K navigation respects collapsed sections**: keyboard navigation now skips over collapsed time slot sections; Ctrl+A and Ctrl+Shift+A also only operate on visible (non-collapsed) sessions

### Bug Fixes

* **Student detail popover**: now shows all contact phone numbers with labels instead of only the single legacy phone field

## [2.0.27](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.27) (2026-03-11)

### New Features

* **Bulk rate & comment**: rate and comment on multiple sessions at once from any timeslot header; copy timeslot info to clipboard
* **Bulk exercise actions**: Print All, Download All, and Download Answers buttons on CW/HW section headers in both session detail and student courseware tab
* **Courseware tab redesign**: consolidated layout with one card per session, CW/HW sub-grouping with colored accents, inline open/print buttons per exercise, and styled filter toggle
* **Clickable test alerts**: upcoming assessment entries on the session detail page now link directly to the exam revision page
* **Esc keyboard shortcut**: press Escape on session detail page to navigate back

### Improvements

* **Courseware tab readability**: darker text, opaque backgrounds, and StickyNote empty states for wooden desk theme in both courseware and tests tabs
* **Print stamps on exercises**: open/print actions now include student info stamps

### Bug Fixes

* Fixed exams page back button always navigating to home instead of the actual previous page
* Extracted shared `useBackNavigation` hook to consolidate duplicated history-aware back navigation

## [2.0.26](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.26) (2026-03-11)

### New Features

* **Multiple contact numbers**: students can now have multiple phone numbers with relationship labels (Mother, Father, Grandparent, Student, Guardian, or custom free text); contacts are editable on the student detail page and add student modal
* **Contact search**: search by any contact phone number across the student list, command palette, and duplicate detection

### Improvements

* **Contacts displayed everywhere**: enrollment detail modal, command palette preview, zen student page, and command palette subtitle all show full contact details with labels

## [2.0.25](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.25) (2026-03-10)

### New Features

* **Haptic feedback**: tactile vibration on mobile for toasts, confirm dialogs, star ratings, action buttons, inbox reactions, voice recording, swipe gestures, and more via web-haptics with Android-optimized raw vibration patterns
* **Tests & exams in command palette**: search tests and exams directly from the command palette with preview panel
* **Feedback email notifications**: superadmin receives a Gmail email when tutors submit bug reports, feature requests, or suggestions via the feedback panel

### Improvements

* **Documents read-only for supervisors**: supervisors can view documents but cannot create, edit, delete, duplicate, lock, or manage folders; backend write endpoints return 403 for read-only roles

### Bug Fixes

* Fixed session cards jumping position when marking attendance (Attended/No Show now sort in place)
* Fixed command palette recent searches saving on every keystroke instead of on selection
* Fixed inbox emoji picker closing after every emoji selection — now stays open until you click away
* Fixed unchecked attendance status column using plain gray pill instead of color-coded status tags

## [2.0.24](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.24) (2026-03-10)

### New Features

* **GIF messaging**: search and send GIFs via GIPHY in inbox replies and compose, with trending browse and debounced search
* **Supervisor broadcast inbox**: supervisors can now view broadcast messages in a read-only inbox (no compose, reply, react, or archive)

### Bug Fixes

* Fixed geometry editor undo/redo not respecting snap-to-grid setting

## [2.0.23](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.23) (2026-03-10)

### Improvements

* **Eligible students based on slot locations**: eligible student count and list now reflect only the locations where revision slots exist, since cross-location revision is not allowed
* **Discard warning on calendar event modal**: closing the event editor with unsaved changes now shows a confirmation prompt

### Bug Fixes

* Fixed voice messages showing 0:00 duration until played (WebM metadata workaround)
* Fixed eligible students expanded list not matching collapsed count when "All Locations" is selected
* Fixed exam-based eligible students endpoint not excluding already-enrolled students

## [2.0.22](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.22) (2026-03-09)

### New Features

* **Zen inbox**: full inbox page in zen mode with thread viewing, media attachments, emoji reactions, and reply composer with file upload
* **Unsaved annotation warning (lesson wide mode)**: exit confirmation dialog with "Download All & Exit" batch ZIP download, browser tab close warning, and `s` shortcut for saving current exercise
* **Unsaved annotation warning (zen lesson mode)**: exit dialog now offers three options: Download All (ZIP), Download Current, and Exit; plus browser tab close warning
* **Non-PDF fallback to Shelv**: local .doc/.docx files in lesson mode now fall through to Shelv search instead of failing

### Improvements

* Faster inbox refresh using background revalidation instead of full reload

### Bug Fixes

* Fixed annotated PDF download producing corrupted files in lesson wide mode
* Fixed zen inbox always fetching messages for tutor ID 0 instead of actual user
* Fixed `/` key being intercepted when typing in non-command-bar inputs
* Fixed focused section not updating when inbox message is expanded
* Fixed reaction button styling for own replies in zen inbox

## [2.0.21](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.21) (2026-03-09)

### New Features

* **Web Push notifications**: receive OS-level notifications for new inbox messages even when the browser tab is closed, using free browser Push API with VAPID keys (no third-party service cost)
* **Favicon unread badge**: red circle with unread message count overlaid on the browser tab icon, visible app-wide across all pages
* **New message banner**: in-app toast showing sender name and preview when a message arrives for another thread, with click-to-jump and auto-dismiss
* **Connection status indicator**: amber "Reconnecting..." or red "Disconnected" bar when the real-time SSE connection drops
* **Differentiated urgent alerts**: urgent/high priority messages play a distinct two-tone sound and show red-accented notifications

### Improvements

* Dedicated 64x64 favicon for crisp display at small sizes
* Inbox tab title shows unread count: `(3) Inbox - CSM Pro`
* Push subscription auto-syncs once per browser session to recover from backend purges

### Bug Fixes

* Fixed zen annotation strokes disappearing after drawing
* Fixed zen lesson PDF viewer race conditions during exercise switching
* Fixed hi-res re-render overwriting pages on exercise switch
* Fixed cached blob URL revocation causing broken images during student switch
* Fixed zen exercise assign showing stale data when switching CW/HW or students
* Fixed zen mode known issues: Escape handling, timer cleanup, and exit dialog

## [2.0.20](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.20) (2026-03-08)

### New Features

* **Shared content panel in chat**: browse all media, files, links, audio, math, and graphs shared in a conversation thread with jump-to-message, sender filter, and tab navigation
* **Chat quality-of-life**: message copy, reply banner, image zoom, loading skeleton, and accessibility improvements
* **Zen lesson mode**: per-session and lesson-wide PDF viewing with keyboard-driven exercise navigation, page browsing, zoom, answer key toggle, open, and print
* **Zen lesson mode exercise editing**: inline CW/HW assignment with pre-populated existing exercises, direct path input, search/browse, multi-select, and editable page ranges
* **Zen lesson mode access everywhere**: `[L]esson` button on time slot headers and session detail panel across zen dashboard and sessions page. `L` opens single-student lesson mode, `Shift+L` opens lesson-wide mode
* **Zen lesson-wide two-digit student keys**: student switcher supports numbers 1–99 with buffered input
* **Zen courseware assign redesign**: tabbed date picker showing session details for clearer context when assigning exercises

### Improvements

* Shared lesson state hook eliminates duplication between single and wide lesson modes
* Shared week date helpers deduplicated across pages
* Dashboard session limit raised from 100 to 2000

### Bug Fixes

* Fixed PDF viewer crash during hi-res canvas re-render
* Fixed trending courseware showing wrong relative time
* Fixed checkbox column wrapping on zen sessions page
* Fixed incoming message timestamp overlapping toolbar
* Fixed reply-to-message linking broken by HTML sanitization stripping quote attributes
* Fixed nested quote clutter in threaded replies
* Fixed reply editor expanding beyond viewport
* Fixed inbox thread pane UX issues with lightbox, scroll memory, and interactions
* Fixed session_log debug writes failing on generated columns

### Known Issues

* **Lesson mode Escape handling**: when editing CW/HW exercises, pressing Escape may close the entire lesson mode instead of just the assignment panel
* **Sessions page missing navigation shortcuts**: day view lacks shortcuts like `gg` (jump to first) that exist on the dashboard
* **Session count ignores filters**: the completed/total count does not update when status or tutor filters are applied
* **Filtered list navigation broken**: cursor up/down navigates the full list instead of only visible filtered sessions
* **Lesson mode feature gaps**: annotation tools, bulk CW/HW download, and other main app lesson features are not yet available in zen lesson mode

## [2.0.19](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.19) (2026-03-07)

### New Features

* **Zen courseware page**: new courseware tab in zen mode with browse, search, and assignment capabilities
* **Zen trending podium**: redesigned zen courseware trending section as a medal ceremony podium with sparkle animation and stats labels

### Bug Fixes

* Fixed sending messages with geometry diagrams failing due to MySQL TEXT column size limit (64KB) — upgraded to MEDIUMTEXT (16MB)
* Fixed PDF preview failing for students with Chinese names — stamp overlay now supports CJK characters
* Fixed PDF preview occasionally showing "Failed to process PDF" despite the file being available — added auto-retry and better error handling
* Fixed zen trending podium filename overflow and alignment across all columns
* Fixed zen courseware page height causing site-level scrollbar

## [2.0.18](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.18) (2026-03-06)

### New Features

* **Lesson-wide mode**: a multi-student lesson view opens from the time slot header, gathering everyone in the slot into one view with by-student and by-file sidebars and full annotation support.
* **Bulk print dropdown**: added CW/HW bulk print and download buttons to lesson-wide mode header for quick access
* **Copy make-up message**: new "Msg" action button on make-up sessions generates a bilingual (中文/English) parent notification message with editable modal, language toggle, and one-tap copy. On mobile, copies directly to clipboard with visual feedback
* **Dashboard lesson button**: added lesson-wide mode button to TodaySessionsCard time slot headers for quick access from the dashboard

### Bug Fixes

* Fixed bulk CW/HW download and print not inserting blank pages for double-sided printing — each student's pages now start on a new front page when printed duplex
* Improved lesson mode header responsiveness on mobile — compact padding, smaller buttons, and floating sidebar toggle for lesson-wide mode

## [2.0.17](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.17) (2026-03-06)

### New Features

* **Exercise history panel**: side panel in exercise modal showing past exercises for each student, with duplicate detection warnings when assigning previously-used exercises
* **"All" proposals tab**: admin and super admin users can now see all proposals across tutors in the proposals view
* **Proposals loading skeletons**: replaced spinner with shimmer skeleton cards matching the proposal card layout
* **Document editor list improvements**: nested lists cycle through their styles, checklists have a toolbar button and a shortcut, an ordered list can start at any number, and right-clicking one offers restart numbering and type changes.
* **Zen mode view toggle & impersonation**: added view mode toggle (My View/Center View) and role impersonation support to zen mode

### Bug Fixes

* Fixed sidebar view switching (My View → Center View) not updating the session page tutor filter on first click
* Fixed "For you" badge incorrectly showing on proposals in the All tab when the admin is neither proposer nor target
* Improved visual distinction between Book/Propose modes in makeup modal — color-coded toggle (green for Book, blue for Propose) with accent border
* Fixed inbox showing message threads not belonging to the current user
* Fixed leave record button always pointing to super admin's link instead of the current user's
* Fixed zen mode column overflow with wider theme fonts
* Removed confusing `!=alerts` hint from zen header
* Restricted Add Student and New Enrollment buttons to admin users only
* Fixed lesson mode answer viewer not respecting custom page ranges — now correctly handles complex page selections (e.g., "1,3,5-7")
* Fixed lesson mode PDF viewer header showing "p3-6" instead of "p3,6" for non-contiguous pages
* Fixed lesson mode PDF viewer "Fit to width" button using a fullscreen-style icon — now uses a horizontal expand icon that better conveys its purpose
* Fixed sessions list time slot chevron icons using confusing tree-view convention — now uses standard accordion pattern (up=collapse, down=expand)

## [2.0.16](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.16) (2026-03-06)

### New Features

* **Zen enrollments**: added inline enrollment detail within zen student view
* **Zen student detail**: expanded to 7 tabs with full feature parity, copy lesson dates, and makeup proposal indicators

### Improvements

* Removed standalone zen enrollments page to match main app structure

### Bug Fixes

* Fixed profile pictures not saving — widened `profile_picture` column from VARCHAR(500) to VARCHAR(2048) to accommodate Google profile picture URLs
* Fixed exercise modal not allowing deletion of all exercises of a type
* Fixed emoji picker appearing beneath the feedback modal
* Fixed makeup session appearing on wrong date in sessions list
* Fixed document editor tab indents not deletable with Backspace — now reduces indent level instead of merging blocks
* Fixed document editor numbered list auto-format being too aggressive — now only triggers on "1. " instead of any number
* Fixed inability to cancel makeup sessions rescheduled to a different tutor — original tutor now also has cancel permission

## [2.0.15](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.15) (2026-03-05)

### New Features

* **Zen mode pages**: added Students, Sessions, Revenue, and Courseware pages with full keyboard navigation
* **Zen sessions week/day views**: redesigned with week summary + day detail layout, bulk-aware quick mark with confirmation dialog
* **Shared zen components**: extracted ZenSpinner and ZenProgressBar for consistent loading states across all zen pages

### Improvements

* Deduplicated zen mark handlers, shared utilities, session sorting, date formatters, and enrollment utilities
* Context-aware nav hints in zen session list (bulk vs default mode)
* Standardized zen divider widths and empty state punctuation
* Fixed zen header shortcut hints (Shift+T, Shift+P) and notification links

### Bug Fixes

* Fixed bulk confirm payment not decrementing student coupon count when enrollment has a coupon discount
* Fixed renewals page bulk actions only processing the last selected item when items were selected across different search queries
* Fixed zen revenue page infinite loading for admin center-view by including tutor loading state
* Fixed zen activity feed cursor color and outline shift on focus
* Fixed dashboard cards overflowing on narrow mobile screens
* Fixed SWR server component build errors in sessionSorting and callMarkApi

## [2.0.14](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.14) (2026-03-01)

### Bug Fixes

* Fixed student profile edits (name, phone, school, etc.) not saving
* Fixed dashboard cards (Today's Sessions, Tests & Exams) overflowing horizontally on narrow screens

## [2.0.13](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.13) (2026-02-27)

### New Features

* **Bulk Confirm Payment on overdue-payments page**: multi-select with checkboxes, section-level select all, and animated batch action bar with optimistic updates
* **Implicit & parametric curves in geometry editor**: curve mode selector (f(x), f(x,y)=0, x(t),y(t)) with MathLive input, t-range controls, and full serialization for save/restore
* **Click-to-edit plotted curves**: select any plotted curve to load its equation back into the input field; Update replaces the curve, Cancel returns to select mode

### Improvements

* Redesigned action button colors for better distinction: Undo (indigo), Extension (purple), Schedule Make-up (teal) — consistent across action buttons and chalkboard stubs
* Moved unpaid badge from a separate pill to a compact inline icon next to the student name on sessions list and dashboard
* Added within-cell sorting to monthly popover grid view for consistency with list view ordering
* Added optimistic updates to renewals page bulk Confirm Payment and Mark Sent actions for instant UI feedback

### Bug Fixes

* Fixed unpaid red student name being overridden by strikethrough gray in Weekly, Daily, Monthly, and MoreSessionsPopover views
* Fixed schedule make-up modal blocking slots that only contain cancelled sessions — conflict check now matches DB guard logic
* Fixed monthly popover grid view missing unpaid red and strikethrough styling on student names
* Fixed geometry editor modal footer (Insert/Cancel) pushed off-screen when function input bars are active — header and footer now pinned with scrollable middle section

## [2.0.12](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.12) (2026-02-27)

### New Features

* **Custom date picker popover**: replaced native date inputs with a calendar popover across sessions list, weekly, and daily grid views for better month navigation without triggering date changes
* **"Active" status filter**: new composite filter option that hides resolved sessions (Pending Make-up, Make-up Booked, Cancelled) in one click
* **Button restyling**: action buttons and View/Lesson links now have borders and shadows to visually distinguish them from info badges

### Improvements

* Improved vertical data density in sessions list and calendar views
* Push undo/cancel/edit action buttons to the right edge of session cards
* Session count moved to badge on toolbar icon for a cleaner toolbar
* De-emphasized resolved sessions with reduced opacity (Pending Make-up 0.8, Make-up Booked 0.6) while keeping action buttons at full opacity
* Hidden CW/HW/Rate buttons and View/Lesson links on resolved session cards
* Applied same action button cleanup to TodaySessionsCard on dashboard
* Made sessions toolbar more compact on mobile

### Bug Fixes

* Fixed cancelled enrollment's deadline still being used for session extension — after cancelling the latest enrollment, the system now correctly falls back to the previous enrollment's deadline
* Fixed unpaid red student name being overridden by strikethrough gray on rescheduled sessions
* Fixed right-aligned action buttons breaking layout in SessionDetailPopover and on mobile
* Fixed loading skeletons to match new sessions list layout
* Fixed time slot headers left-aligned on mobile, centered on desktop
* Fixed debug table horizontal scrollbar accessibility

## [2.0.11](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.11) (2026-02-23)

### New Features

* **Geometry editor drag-to-pan**: middle-click or right-click drag to pan the board in any tool mode; two-finger touch pan on mobile devices

### Bug Fixes

* Fixed terminated students dropdown showing current/future quarters that aren't ready for review
* Fixed documents page tab buttons overflowing on mobile

## [2.0.10](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.10) (2026-02-22)

### New Features

* **Document preview pane**: toggle a side panel to preview documents without leaving the list; includes print buttons (Questions Only / With Answers) and keyboard shortcuts (Enter to open, Escape to close)
* **My Docs & Recent tabs**: unified tab bar (All Docs | My Docs | Recent | Templates) replaces separate tabs and scope filters; My Docs shows documents you created or edited, Recent tracks documents you opened via localStorage
* **Pending make-ups view**: the pending make-ups view groups by urgency into collapsible tiers, with lazy loading, a sort toggle, the root original date and a notification bell item for the aged ones.
* **Sort tiebreakers**: sessions with the same pending days now sort by location, then school student ID

### Performance

* Fixed infinite re-renders on pending-makeups view caused by Next.js 15 history patching and unstable context provider values
* Memoized all context provider values (Auth, Location, Role, CommandPalette, Toast) and SWRConfig
* Stabilized useActiveTutors hook, keyboard effect dependencies, and scroll handler

### Bug Fixes

* Fixed list view item backgrounds protruding past rounded container corners on mobile

## [2.0.9](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.9) (2026-02-22)

### New Features

* **Editable templates**: create, edit, and delete document templates from the frontend
* **Auto-delete empty docs**: untitled documents with no content are automatically deleted on exit; folder-scoped unique title enforcement
* **Last editor tracking**: display who last edited a document, separate from the original author

### Improvements

* Template visual styling and metadata display
* Document dropdown menus migrated to portal-based rendering for correct stacking
* Archived documents now clickable with in-editor archived banner and Restore button
* Footer pushed to page bottom on single-page documents
* Sidebar transition smoothed when switching document/template tabs
* Editor metadata moved inline with tags row on desktop
* Table button repositioned in Insert toolbar

### Bug Fixes

* Fixed Delete key removing last empty paragraph (acting like Backspace)
* Fixed single-page spacer jitter by using flex-grow layout
* Fixed tiptap min-height causing oversized single pages
* Fixed stale "Load More" button by deriving hasMore from data
* Fixed TestCalendar upcoming section theme colors

## [2.0.8](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.8) (2026-02-21)

### New Features

* **Version history**: side-by-side version diff with rich formatting, dynamic zoom, and layout comparison
* **Pagination architecture**: migrated from Widget Decorations to Node Decorations + React overlay for stable page division, headers, footers, and watermarks

### Improvements

* Mobile responsiveness and UX polish for document list
* Simplified document list with shared utilities
* Location dropdown styling in settings modal

### Bug Fixes

* Fixed code blocks printing with dark background — now uses light theme with print-safe syntax highlighting in all editor modes
* Fixed sidebar scroll shadows scrolling away instead of staying pinned
* Fixed page chrome overlay alignment — footer/header/gap overlays now correctly offset for CSS padding-box origin

## [2.0.7](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.7) (2026-02-21)

### New Features

* **Tags & folders**: organize documents with color-coded tags and a nested folder sidebar; tag search popover and inline editor tag dropdown
* **Table enhancements**: column resize, cell background color picker, and merge/split cells
* **Line spacing**: configurable line spacing for paragraphs and headings (1.0–3.0)
* **Page count**: status bar shows total pages when document has more than one page
* **{total} placeholder**: use `{total}` in headers/footers for "Page 1 of 3" style numbering
* **Justify alignment**: fourth text alignment option in toolbar and bubble menu
* **Link popover**: inline popover for inserting and editing links (replaces browser prompt)
* **Code blocks**: supported in document editor
* **8×8 table grid**: expanded table size picker for larger tables

### Improvements

* Document list pagination with sort controls and grid/list view toggle
* Image upload validation on document list
* Pagination footer stays at page bottom while typing; scroll position stable during page recalculation
* Backgrounds and colors print correctly; isolated lines avoided at page breaks
* Context menu accessible on mobile without hover
* Search on document list debounced for smoother typing; clear button added
* Empty state message adapts to active filters
* Keyboard shortcuts modal includes math and code block shortcuts
* Student coupon badge shows last-updated date on hover

### Bug Fixes

* Fixed document list theme contrast — missing dark mode variants on action buttons, low-contrast grey text against warm desk surface, and semi-transparent backgrounds letting desk texture bleed through
* Fixed mobile list view doc type icon not showing dark mode color
* Fixed archived document border style not rendering (invalid Tailwind class)
* Fixed context menus not closing on outside click
* Fixed Ctrl+S always triggers save for visual feedback
* Fixed answer section hover colors in dark paper mode
* Fixed staff referral checkbox not saving

## [2.0.6](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.6) (2026-02-20)

### New Features

* **Document Builder**: full A4 document editor with TipTap: rich text formatting, tables with grid picker, resizable images with alignment/text wrapping, math equations (KaTeX), and geometry diagrams (JSXGraph)
* **Page layout settings**: configurable margins, headers/footers with text templates ({title}, {page}, {date}), image logos, and separate English/Chinese font selection
* **Pagination system**: accurate page break calculation with visual page gaps, headers/footers rendered in decorations, and zoom-independent measurement
* **Print support**: browser-native print with correct page breaks, headers, footers, and watermarks; "Questions Only" and "With Answers" print modes
* **Answer Key section**: floating, collapsible answer overlay with drag-to-reposition and per-question labeling
* **Find & Replace**: search with highlight decorations, navigate between matches, replace current or all occurrences
* **Keyboard shortcuts modal**: categorized reference for all editor shortcuts (Ctrl+/)
* **Zoom controls**: zoom in/out with fit-to-width default on mobile; page breaks remain accurate at any zoom level
* **Paper mode**: document always displays in light/print colors regardless of global dark mode, with toggle in status bar
* **Document management**: create, duplicate, archive, restore, and permanently delete documents; mobile-responsive list view
* **Document templates**: create documents from templates (e.g. MathConcept) with pre-configured margins, footer, watermark, and body font
* **Body font settings**: new Fonts tab in Page Layout modal to set default font family (English + CJK) and font size for the document
* **Block indent/outdent**: Tab/Shift+Tab to indent or outdent paragraphs and headings (up to 8 levels); toolbar buttons in Format tab

### Improvements

* Resizable media nodes support drag handles, alignment (left/center/right), and text wrapping
* Tabbed toolbar layout with search and keyboard shortcuts buttons
* Bubble menu for inline formatting on text selection
* Explicit page break nodes insertable from toolbar
* Documents section in sidebar with Beta badge
* Toolbar font and size dropdowns reactively reflect the cursor-selected text style

### Bug Fixes

* Fixed watermark only appearing on first page in editor view
* Fixed decoration watermark greyish overlay in light mode and white pixels in dark mode

## [2.0.5](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.5) (2026-02-16)

### New Features

* **Code blocks with syntax highlighting**: toggle via toolbar button or type ``` in the editor; ~35 common languages auto-detected with Catppuccin Mocha color theme; highlighting preserved in sent messages
* **Drag-and-drop attachment reordering**: drag images horizontally or files vertically (with grip handle) to reorder before sending, in both reply composer and compose modal

### Improvements

* Scheduled messages now deliver reliably via background task even if the sender doesn't reopen their inbox
* Math editor templates insert at cursor position instead of replacing the entire equation
* Snoozed and scheduled message lists load faster with batched queries

### Bug Fixes

* Fixed segment measurement labels not updating color when switching between light and dark mode
* Fixed measurement label colors reverting to stale values on undo/redo

## [2.0.4](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.4) (2026-02-15)

### New Features

* **Interactive geometry editor**: draw points, lines, segments, circles, polygons, function graphs, text labels, and angles on an interactive JSXGraph board; hexagon toolbar button in the inbox editor
* **Geometry viewer**: click sent diagram thumbnails to open an interactive read-only viewer with zoom in/out/reset controls and drag-to-pan
* **Function graphing**: plot mathematical functions via LaTeX input with MathLive virtual keyboard, converted to JS and rendered as curves on the geometry board
* **Theme-reactive geometry boards**: boards re-render with correct colors when switching between light and dark mode
* **Grid snapping**: toggle snap-to-grid in the geometry editor toolbar (on by default) for precise point placement at integer coordinates
* **Auto-named points**: points are automatically labeled A, B, C, ...; click a point in select mode to rename it
* **Touch support**: geometry editor and viewer optimized for touch devices with larger hit targets and no browser gesture interference
* **Area-select & group movement**: drag a selection rectangle over compound elements (angles, polygons, circles, segments) then drag any defining point to move the entire shape as a unit
* **Polygon interior dragging**: click inside any polygon to drag it by its interior
* **Exact angle input**: type a degree value in the text field when placing an angle to auto-compute the third point at the exact angle

### Improvements

* Snap-to-grid toggle now updates all existing points on the board
* Theme toggle updates geometry board colors smoothly without visible flash

### Bug Fixes

* Fixed MathLive menu button requiring long press to open
* Fixed matrix equations showing "amp" text in sent messages
* Fixed doubled axis tick labels in geometry viewer
* Fixed invalid geometry thumbnails not rendering

## [2.0.3](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.3) (2026-02-15)

### New Features

* **Math equations in inbox**: type `$...$` for inline or `$$...$$` for block math, rendered with KaTeX; Sigma toolbar button converts selected text to equations; click to edit existing equations
* **Math equation editor modal**: dedicated editor with MathLive mathfield and virtual keyboard for visual equation input; supports inline/block mode toggle with descriptions, edit/delete existing equations, and Ctrl/⌘+Enter shortcut to insert
* **Themed virtual keyboard**: MathLive keyboard styled with warm brown palette matching app design, with full dark mode support

### Bug Fixes

* Fixed send button disabled when message contains only math equations
* Fixed math equations disappearing from message bubbles
* Fixed memory leak in math editor modal
* Fixed focus not returning to message editor after closing math modal
* Fixed math input border invisible in dark mode

## [2.0.2](https://github.com/kenny1934/tutoring-management-system/releases/tag/v2.0.2) (2026-02-14)

### New Features

* **Chat-style thread view**: redesigned inbox thread detail with message bubbles, avatars, date separators, and typing indicators
* **Scheduled send**: compose messages with schedule picker (preset times or custom datetime), inline edit before send, delivery timestamp updated on send
* **@Mentions**: type `@` in the editor for autocomplete, mentions stored and surfaced in dedicated Mentions sidebar with unread badge and priority notifications that bypass thread mute
* **Snooze**: snooze messages with preset or custom times, background task automatically marks as unread when snooze expires via SSE
* **Voice messages**: record audio via microphone, upload to cloud storage, inline AudioPlayer with waveform visualization
* **Message templates**: quick-insert reusable message templates from a picker
* **Link previews**: automatic Open Graph previews for URLs in messages
* **Emoji reactions**: react to messages with emoji, displayed as pills below message bubbles

### Improvements

* **Sidebar reorganization**: 3 sections: primary mailboxes, smart views (Starred, Mentions, Send Later, Snoozed), and collapsible Tags
* **Rich interactions**: quote-reply, message forwarding, swipe actions, keyboard shortcuts
* **Paste/drag image uploads**: supports multiple images at once
* **Search highlighting**: across thread list and message content
* **Draft auto-save**: with thread list preview indicator
* **Dark mode polish**: across all new components
* **Performance**: faster navigation and smoother category switching
* **Video & GIF attachments**: send and preview video/GIF files inline in messages
* **Message forwarding with attachments**: forwarded messages now include all original attachments (images, files, voice recordings)
* **Categorized attachment menu**: attachment button opens a popover with Photos & Videos / Document sections
* **File attachments in replies**: attach files when replying, with thumbnail previews and remove button
* **Improved toolbar dropdowns**: emoji, color picker, attachments, and template menus no longer get clipped on mobile or in edit mode
* **Slide animations**: smooth expand/collapse on search filters panel and collapsible sections

### Bug Fixes

* Unread counts now exclude scheduled (unsent) messages
* Fixed inbox loading indicator getting stuck when switching categories
* Fixed snooze reminders firing at wrong times due to timezone mismatch
* Fixed scheduled messages occasionally being sent twice
* Fixed threads sometimes getting pinned twice
* Fixed voice message icon not displaying correctly
* Fixed voice message duration not saving correctly
* Fixed console warning in rich text editor
* Fixed changelog markdown rendering on What's New page

## [2.0.1](https://github.com/kennygodin/tutoring-management-system/releases/tag/v2.0.1) (2026-02-13)

### New Features

* Group messaging — send messages to multiple specific tutors (not just one or all)
* Multi-select recipient picker with tutor checkboxes and chip display
* Group messages show "Group (N)" badge in thread list and green highlight in thread detail
* Reply to group message inherits original recipients

### Improvements

* Message pinning/starring across all inbox views (inbox, archived, categories)
* Inbox sidebar reorganized into Mailboxes and Categories sections
* Draft auto-save for compose and reply forms
* Batch "Mark All Read" for current category or entire inbox

## [2.0.0](https://github.com/kennygodin/tutoring-management-system/releases/tag/v2.0.0) (2026-02-13)

### New Features

* Launch of CSM Pro web application — a complete rebuild from the original AppSheet v1.x
* Dashboard with real-time stats, activity feed, and notification system
* Session management with attendance tracking and make-up proposals
* Student enrollment lifecycle with fee calculation and renewal tracking
* Inbox messaging system with threads, search, and categories
* Courseware library with usage analytics
* Revenue reporting and overdue payment tracking
* Exam revision slot management
* Role-based access control (Super Admin, Admin, Supervisor, Tutor, Guest)
* Command palette (Ctrl+K) for quick navigation
* Dark mode support
