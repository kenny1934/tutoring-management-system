-- Curriculum suggestions view showing multiple week options
-- Always shows Week N-1, N, and N+1 to give tutors context and choice
-- Acknowledges that curriculum pacing varies between schools and years

DROP VIEW IF EXISTS session_curriculum_suggestions;

CREATE VIEW session_curriculum_suggestions AS
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
    
    -- Current week information
    aw_current.week_number AS current_week_number,
    aw_current.academic_year AS current_academic_year,
    
    -- ALWAYS show 3 weeks of suggestions from last year
    -- Previous Week (N-1)
    sc_prev.topic_consensus AS week_before_topic,
    sc_prev.week_number AS week_before_number,
    
    -- Current Week (N)
    sc_exact.topic_consensus AS same_week_topic,
    sc_exact.week_number AS same_week_number,
    
    -- Next Week (N+1)
    sc_next.topic_consensus AS week_after_topic,
    sc_next.week_number AS week_after_number,
    
    -- Primary suggestion (best guess based on date)
    CASE
        -- Early September typically means schools are one week behind
        WHEN MONTH(sl.session_date) = 9 AND DAY(sl.session_date) <= 10 
            THEN COALESCE(sc_prev.topic_consensus, sc_exact.topic_consensus, sc_next.topic_consensus)
        -- Otherwise default to exact week match
        ELSE COALESCE(sc_exact.topic_consensus, sc_prev.topic_consensus, sc_next.topic_consensus)
    END AS primary_suggestion,
    
    -- Format all suggestions for display with better UX
    CONCAT(
        '📚 Last Year References:\n',
        -- Week before with recommendation tag for early September
        IF(sc_prev.topic_consensus IS NOT NULL, 
            CONCAT('Week ', sc_prev.week_number, ': ', sc_prev.topic_consensus,
                   IF(MONTH(sl.session_date) = 9 AND DAY(sl.session_date) <= 10, ' 👈 Likely', ''), '\n'), ''),
        -- Same week number (neutral, just informative)
        IF(sc_exact.topic_consensus IS NOT NULL, 
            CONCAT('Week ', sc_exact.week_number, ': ', sc_exact.topic_consensus, ' (same week #)\n'), ''),
        -- Week after
        IF(sc_next.topic_consensus IS NOT NULL, 
            CONCAT('Week ', sc_next.week_number, ': ', sc_next.topic_consensus, '\n'), ''),
        IF(sc_prev.topic_consensus IS NULL AND sc_exact.topic_consensus IS NULL AND sc_next.topic_consensus IS NULL,
            CONCAT('No data available for weeks ', (aw_current.week_number - 1), '-', (aw_current.week_number + 1)), '')
    ) AS suggestions_display,
    
    -- User-friendly single line display for AppSheet
    CASE
        -- Early September: Show Week 1 as recommended
        WHEN MONTH(sl.session_date) = 9 AND DAY(sl.session_date) <= 10 AND sc_prev.topic_consensus IS NOT NULL THEN
            CONCAT('💡 Recommended: ', LEFT(sc_prev.topic_consensus, 40), '... (Week ', sc_prev.week_number, ')')
        -- Otherwise show exact week match if available
        WHEN sc_exact.topic_consensus IS NOT NULL THEN 
            CONCAT('📖 Reference: ', LEFT(sc_exact.topic_consensus, 40), '... (Week ', sc_exact.week_number, ')')
        -- Fallback to previous week
        WHEN sc_prev.topic_consensus IS NOT NULL THEN 
            CONCAT('📖 Reference: ', LEFT(sc_prev.topic_consensus, 40), '... (Week ', sc_prev.week_number, ')')
        -- Or next week
        WHEN sc_next.topic_consensus IS NOT NULL THEN 
            CONCAT('📖 Reference: ', LEFT(sc_next.topic_consensus, 40), '... (Week ', sc_next.week_number, ')')
        ELSE '📚 No curriculum reference available'
    END AS user_friendly_display,
    
    -- Alternative: Clean options display for buttons/cards
    CONCAT_WS('|',
        IF(sc_prev.topic_consensus IS NOT NULL, 
           CONCAT('Earlier:', LEFT(sc_prev.topic_consensus, 25)), NULL),
        IF(sc_exact.topic_consensus IS NOT NULL, 
           CONCAT('Standard:', LEFT(sc_exact.topic_consensus, 25)), NULL),
        IF(sc_next.topic_consensus IS NOT NULL, 
           CONCAT('Advanced:', LEFT(sc_next.topic_consensus, 25)), NULL)
    ) AS options_for_buttons,
    
    -- Count how many suggestions are available
    (CASE WHEN sc_prev.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN sc_exact.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN sc_next.topic_consensus IS NOT NULL THEN 1 ELSE 0 END) AS suggestion_count,
     
    -- Flag if we have good coverage
    CASE 
        WHEN sc_prev.topic_consensus IS NOT NULL 
            AND sc_exact.topic_consensus IS NOT NULL 
            AND sc_next.topic_consensus IS NOT NULL THEN 'Full Coverage'
        WHEN (CASE WHEN sc_prev.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_exact.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_next.topic_consensus IS NOT NULL THEN 1 ELSE 0 END) >= 2 THEN 'Partial Coverage'
        WHEN (CASE WHEN sc_prev.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_exact.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_next.topic_consensus IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 'Limited Coverage'
        ELSE 'No Coverage'
    END AS coverage_status

FROM session_log sl
    LEFT JOIN students s ON s.id = sl.student_id
    LEFT JOIN tutors t ON t.id = sl.tutor_id
    
    -- Current academic week
    LEFT JOIN academic_weeks aw_current ON sl.session_date >= aw_current.week_start_date 
        AND sl.session_date <= aw_current.week_end_date
        AND aw_current.academic_year = CASE 
            WHEN MONTH(sl.session_date) >= 9 OR MONTH(sl.session_date) <= 8 THEN
                CONCAT(YEAR(sl.session_date) - (MONTH(sl.session_date) < 9), '-', YEAR(sl.session_date) + (MONTH(sl.session_date) >= 9))
            ELSE NULL
        END
    
    -- PREVIOUS WEEK (N-1)
    LEFT JOIN school_curriculum sc_prev ON sc_prev.school = s.school
        AND sc_prev.grade = s.grade
        AND sc_prev.lang_stream = s.lang_stream
        AND sc_prev.week_number = aw_current.week_number - 1
        AND sc_prev.academic_year = '2024-2025'
    
    -- EXACT WEEK (N)
    LEFT JOIN school_curriculum sc_exact ON sc_exact.school = s.school
        AND sc_exact.grade = s.grade
        AND sc_exact.lang_stream = s.lang_stream
        AND sc_exact.week_number = aw_current.week_number
        AND sc_exact.academic_year = '2024-2025'
    
    -- NEXT WEEK (N+1)  
    LEFT JOIN school_curriculum sc_next ON sc_next.school = s.school
        AND sc_next.grade = s.grade
        AND sc_next.lang_stream = s.lang_stream
        AND sc_next.week_number = aw_current.week_number + 1
        AND sc_next.academic_year = '2024-2025'

ORDER BY sl.session_date DESC, sl.id DESC;