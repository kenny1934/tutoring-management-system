-- Enhanced curriculum suggestions with LIVE current-year data
-- Shows real-time updates from other tutors this academic year
-- Falls back to historical data when current year not available

DROP VIEW IF EXISTS session_curriculum_suggestions_live;

CREATE VIEW session_curriculum_suggestions_live AS
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
    
    -- CURRENT YEAR DATA (2025-2026) - Real-time collaborative data
    sc_current_prev.topic_consensus AS current_week_before_topic,
    sc_current_exact.topic_consensus AS current_same_week_topic,
    sc_current_next.topic_consensus AS current_week_after_topic,
    
    -- HISTORICAL DATA (2024-2025) - Fallback reference
    sc_hist_prev.topic_consensus AS hist_week_before_topic,
    sc_hist_exact.topic_consensus AS hist_same_week_topic,
    sc_hist_next.topic_consensus AS hist_week_after_topic,
    
    -- SMART SUGGESTIONS: Use current year if available, fallback to historical
    COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus) AS week_before_topic,
    COALESCE(sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus) AS same_week_topic,
    COALESCE(sc_current_next.topic_consensus, sc_hist_next.topic_consensus) AS week_after_topic,
    
    -- DATA SOURCE INDICATORS for transparency
    CASE WHEN sc_current_prev.topic_consensus IS NOT NULL THEN 'LIVE' ELSE 'HISTORICAL' END AS week_before_source,
    CASE WHEN sc_current_exact.topic_consensus IS NOT NULL THEN 'LIVE' ELSE 'HISTORICAL' END AS same_week_source,
    CASE WHEN sc_current_next.topic_consensus IS NOT NULL THEN 'LIVE' ELSE 'HISTORICAL' END AS week_after_source,
    
    -- PRIMARY SUGGESTION with source indication
    CASE
        -- Early September: prefer previous week
        WHEN MONTH(sl.session_date) = 9 AND DAY(sl.session_date) <= 10 THEN
            COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus, 
                    sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus,
                    sc_current_next.topic_consensus, sc_hist_next.topic_consensus)
        -- Otherwise: prefer exact week
        ELSE
            COALESCE(sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus,
                    sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus,
                    sc_current_next.topic_consensus, sc_hist_next.topic_consensus)
    END AS primary_suggestion,
    
    -- RICH DISPLAY with real-time indicators
    CONCAT(
        '📚 Curriculum References:\n',
        -- Week before
        IF(COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus) IS NOT NULL,
           CONCAT('Week ', aw_current.week_number - 1, ': ',
                  COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus),
                  CASE WHEN sc_current_prev.topic_consensus IS NOT NULL THEN ' ✅ (Live)'
                       ELSE ' 📖 (Historical)' END,
                  IF(MONTH(sl.session_date) = 9 AND DAY(sl.session_date) <= 10, ' 👈 Likely', ''),
                  '\n'), ''),
        -- Same week  
        IF(COALESCE(sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus) IS NOT NULL,
           CONCAT('Week ', aw_current.week_number, ': ',
                  COALESCE(sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus),
                  CASE WHEN sc_current_exact.topic_consensus IS NOT NULL THEN ' ✅ (Live)'
                       ELSE ' 📖 (Historical)' END,
                  '\n'), ''),
        -- Week after
        IF(COALESCE(sc_current_next.topic_consensus, sc_hist_next.topic_consensus) IS NOT NULL,
           CONCAT('Week ', aw_current.week_number + 1, ': ',
                  COALESCE(sc_current_next.topic_consensus, sc_hist_next.topic_consensus),
                  CASE WHEN sc_current_next.topic_consensus IS NOT NULL THEN ' ✅ (Live)'
                       ELSE ' 📖 (Historical)' END,
                  '\n'), ''),
        -- No data message
        IF(COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus,
                   sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus,
                   sc_current_next.topic_consensus, sc_hist_next.topic_consensus) IS NULL,
           CONCAT('No data available for weeks ', (aw_current.week_number - 1), '-', (aw_current.week_number + 1)), '')
    ) AS suggestions_display,
    
    -- COVERAGE STATUS with live data awareness
    CASE 
        WHEN (CASE WHEN sc_current_prev.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_current_exact.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_current_next.topic_consensus IS NOT NULL THEN 1 ELSE 0 END) >= 2 THEN 'Live + Complete'
        WHEN (CASE WHEN sc_current_prev.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_current_exact.topic_consensus IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN sc_current_next.topic_consensus IS NOT NULL THEN 1 ELSE 0 END) >= 1 THEN 'Live + Partial'
        WHEN (CASE WHEN COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus) IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN COALESCE(sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus) IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN COALESCE(sc_current_next.topic_consensus, sc_hist_next.topic_consensus) IS NOT NULL THEN 1 ELSE 0 END) >= 2 THEN 'Historical Complete'
        WHEN (CASE WHEN COALESCE(sc_current_prev.topic_consensus, sc_hist_prev.topic_consensus) IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN COALESCE(sc_current_exact.topic_consensus, sc_hist_exact.topic_consensus) IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN COALESCE(sc_current_next.topic_consensus, sc_hist_next.topic_consensus) IS NOT NULL THEN 1 ELSE 0 END) >= 1 THEN 'Historical Partial'
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
    
    -- CURRENT YEAR (2025-2026) curriculum data
    LEFT JOIN school_curriculum sc_current_prev ON sc_current_prev.school = s.school
        AND sc_current_prev.grade = s.grade
        AND sc_current_prev.lang_stream = s.lang_stream
        AND sc_current_prev.week_number = aw_current.week_number - 1
        AND sc_current_prev.academic_year = aw_current.academic_year
        
    LEFT JOIN school_curriculum sc_current_exact ON sc_current_exact.school = s.school
        AND sc_current_exact.grade = s.grade
        AND sc_current_exact.lang_stream = s.lang_stream
        AND sc_current_exact.week_number = aw_current.week_number
        AND sc_current_exact.academic_year = aw_current.academic_year
        
    LEFT JOIN school_curriculum sc_current_next ON sc_current_next.school = s.school
        AND sc_current_next.grade = s.grade
        AND sc_current_next.lang_stream = s.lang_stream
        AND sc_current_next.week_number = aw_current.week_number + 1
        AND sc_current_next.academic_year = aw_current.academic_year
    
    -- HISTORICAL (2024-2025) curriculum data as fallback
    LEFT JOIN school_curriculum sc_hist_prev ON sc_hist_prev.school = s.school
        AND sc_hist_prev.grade = s.grade
        AND sc_hist_prev.lang_stream = s.lang_stream
        AND sc_hist_prev.week_number = aw_current.week_number - 1
        AND sc_hist_prev.academic_year = '2024-2025'
        
    LEFT JOIN school_curriculum sc_hist_exact ON sc_hist_exact.school = s.school
        AND sc_hist_exact.grade = s.grade
        AND sc_hist_exact.lang_stream = s.lang_stream
        AND sc_hist_exact.week_number = aw_current.week_number
        AND sc_hist_exact.academic_year = '2024-2025'
        
    LEFT JOIN school_curriculum sc_hist_next ON sc_hist_next.school = s.school
        AND sc_hist_next.grade = s.grade
        AND sc_hist_next.lang_stream = s.lang_stream
        AND sc_hist_next.week_number = aw_current.week_number + 1
        AND sc_hist_next.academic_year = '2024-2025'

ORDER BY sl.session_date DESC, sl.id DESC;