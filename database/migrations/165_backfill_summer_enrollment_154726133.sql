-- Migration 165: Backfill the summer records behind enrollment 154726133
-- (student 445). The enrollment was mistakenly created as a Regular renewal
-- during summer and later re-typed to Summer, which left it with no summer
-- application, no slot placements and no lesson-number linkage. This rebuilds
-- what a native summer publish would have created: the application, six
-- placements into slot 226 (Thursday 14:30 - 16:00 at Vasco, grade F4,
-- lessons 3 to 8) and the session_log links. Every statement is guarded so a
-- re-run is a no-op.

-- 1. The application. Name, school, stream and contact details are pulled
--    from the student row rather than written as literals, and the reference
--    code is generated at run time, so nothing personal lands in this file.

SET @code = CONCAT('SC2026-', UPPER(LEFT(MD5(RAND()), 5)));

INSERT INTO summer_applications (
    config_id, reference_code, student_name, school, grade, lang_stream,
    is_existing_student, verified_branch_origin, current_centers,
    wechat_id, contact_phone, preferred_location,
    preference_1_day, preference_1_time,
    existing_student_id, application_status, admin_notes,
    submitted_at, reviewed_by, reviewed_at,
    form_language, sessions_per_week, lessons_paid, paid_at
)
SELECT
    5, @code, s.student_name, s.school, 'F4', s.lang_stream,
    'MathConcept Secondary Academy', 'MSA', '["華士古分校"]',
    s.school_student_id, s.phone, '華士古分校',
    'Thursday', '14:30 - 16:00',
    s.id, 'Enrolled',
    'Backfilled on 2026-08-26. The summer enrollment was mistakenly created as a Regular enrollment, so this application was reconstructed afterwards to restore the summer records.',
    '2026-07-16 10:27:14', 'Mr David Choi', '2026-07-31 00:00:00',
    'zh', 1, 6, '2026-07-31 00:00:00'
FROM students s
WHERE s.id = 445
  AND NOT EXISTS (
    SELECT 1 FROM summer_applications sa
    WHERE sa.config_id = 5 AND sa.existing_student_id = 445
  );

SET @app_id = (
    SELECT id FROM summer_applications
    WHERE config_id = 5 AND existing_student_id = 445
    LIMIT 1
);

-- 2. The six placements, mirroring how the arrangement board publishes them.
--    Lesson ids 1377 to 1382 are lessons 3 to 8 of slot 226.

INSERT INTO summer_sessions (application_id, slot_id, lesson_id, session_status, placed_at, placed_by)
SELECT @app_id, 226, 1377, 'Confirmed', '2026-07-16 10:27:14', 'Mr David Choi' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM summer_sessions WHERE application_id = @app_id AND lesson_id = 1377);

INSERT INTO summer_sessions (application_id, slot_id, lesson_id, session_status, placed_at, placed_by)
SELECT @app_id, 226, 1378, 'Confirmed', '2026-07-16 10:27:14', 'Mr David Choi' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM summer_sessions WHERE application_id = @app_id AND lesson_id = 1378);

INSERT INTO summer_sessions (application_id, slot_id, lesson_id, session_status, placed_at, placed_by)
SELECT @app_id, 226, 1379, 'Confirmed', '2026-07-16 10:27:14', 'Mr David Choi' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM summer_sessions WHERE application_id = @app_id AND lesson_id = 1379);

INSERT INTO summer_sessions (application_id, slot_id, lesson_id, session_status, placed_at, placed_by)
SELECT @app_id, 226, 1380, 'Confirmed', '2026-07-16 10:27:14', 'Mr David Choi' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM summer_sessions WHERE application_id = @app_id AND lesson_id = 1380);

INSERT INTO summer_sessions (application_id, slot_id, lesson_id, session_status, placed_at, placed_by)
SELECT @app_id, 226, 1381, 'Confirmed', '2026-07-16 10:27:14', 'Mr David Choi' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM summer_sessions WHERE application_id = @app_id AND lesson_id = 1381);

INSERT INTO summer_sessions (application_id, slot_id, lesson_id, session_status, placed_at, placed_by)
SELECT @app_id, 226, 1382, 'Confirmed', '2026-07-16 10:27:14', 'Mr David Choi' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM summer_sessions WHERE application_id = @app_id AND lesson_id = 1382);

-- 3. Link each lesson's live session_log row to its placement. Superseded
--    originals and intermediate reschedules stay null, matching how the
--    reschedule flow migrates the link onto the surviving make-up row.

UPDATE session_log sl
JOIN summer_sessions ss ON ss.application_id = @app_id AND ss.lesson_id = 1377
SET sl.summer_session_id = ss.id, sl.lesson_number = 3
WHERE sl.id = 10018074;

UPDATE session_log sl
JOIN summer_sessions ss ON ss.application_id = @app_id AND ss.lesson_id = 1378
SET sl.summer_session_id = ss.id, sl.lesson_number = 4
WHERE sl.id = 10018075;

UPDATE session_log sl
JOIN summer_sessions ss ON ss.application_id = @app_id AND ss.lesson_id = 1379
SET sl.summer_session_id = ss.id, sl.lesson_number = 5
WHERE sl.id = 10019054;

UPDATE session_log sl
JOIN summer_sessions ss ON ss.application_id = @app_id AND ss.lesson_id = 1380
SET sl.summer_session_id = ss.id, sl.lesson_number = 6
WHERE sl.id = 10019148;

UPDATE session_log sl
JOIN summer_sessions ss ON ss.application_id = @app_id AND ss.lesson_id = 1381
SET sl.summer_session_id = ss.id, sl.lesson_number = 7
WHERE sl.id = 10019272;

UPDATE session_log sl
JOIN summer_sessions ss ON ss.application_id = @app_id AND ss.lesson_id = 1382
SET sl.summer_session_id = ss.id, sl.lesson_number = 8
WHERE sl.id = 10019332;

-- 4. Enrollment fields a native summer publish would have set. The renewal
--    pointer is cleared because no summer enrollment carries one and keeping
--    it would make the June regular block count as renewed on the renewals
--    dashboard.

UPDATE enrollments
SET summer_application_id = @app_id,
    renewed_from_enrollment_id = NULL,
    revenue_total = 2400.00,
    locked_discount_code = 'NONE',
    locked_discount_amount = 0,
    payment_deadline = '2026-07-23'
WHERE id = 154726133;

-- 5. One audit row so the application history records the move into Enrolled
--    and the un-publish fallback has a status to return to.

INSERT INTO summer_application_edits (application_id, edited_at, field_name, old_value, new_value, edited_via, edited_by)
SELECT @app_id, CONVERT_TZ(NOW(), '+00:00', '+08:00'), 'application_status', 'Paid', 'Enrolled', 'admin', 'kenny.chiu@mathconceptsecondary.academy' FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM summer_application_edits
    WHERE application_id = @app_id AND field_name = 'application_status'
);
