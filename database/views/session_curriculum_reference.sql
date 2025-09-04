-- Create view for session curriculum reference
-- This view shows all session data with curriculum reference from last year
-- AppSheet will use this as a data source instead of virtual columns

DROP VIEW IF EXISTS session_curriculum_reference;

CREATE VIEW session_curriculum_reference AS
SELECT 
    sl.id,
    sl.enrollment_id,
    sl.student_id,
    sl.tutor_id,
    sl.session_date,
    sl.time_slot,
    sl.location,
    sl.session_status,
    sl.financial_status,
    sl.notes,
    sl.performance_rating,
    sl.attendance_marked_by,
    sl.attendance_mark_time,
    sl.created_at,
    sl.previous_session_status,
    sl.last_modified_by,
    sl.last_modified_time,
    sl.make_up_for_id,
    sl.rescheduled_to_id,
    
    -- Student information
    s.school_student_id,
    s.student_name,
    s.grade,
    s.school,
    s.lang_stream,
    s.home_location,
    
    -- Tutor information  
    t.tutor_name,
    
    -- Curriculum reference from last year (2024-2025)
    sc.topic_consensus AS last_year_curriculum,
    sc.confidence_score AS curriculum_confidence,
    CASE 
        WHEN sc.topic_consensus IS NOT NULL THEN 'Available'
        ELSE 'No Data'
    END AS curriculum_status,
    
    -- Academic week information
    aw.week_number AS current_week_number,
    aw.academic_year AS current_academic_year

FROM session_log sl
    LEFT JOIN students s ON s.id = sl.student_id
    LEFT JOIN tutors t ON t.id = sl.tutor_id
    LEFT JOIN academic_weeks aw ON sl.session_date >= aw.week_start_date 
        AND sl.session_date <= aw.week_end_date
        AND aw.academic_year = '2025-2026'  -- Current academic year
    LEFT JOIN school_curriculum sc ON sc.school = s.school
        AND sc.grade = s.grade
        AND sc.lang_stream = s.lang_stream
        AND sc.week_number = aw.week_number
        AND sc.academic_year = '2024-2025'  -- Reference year (last year)

ORDER BY sl.session_date DESC, sl.id DESC;