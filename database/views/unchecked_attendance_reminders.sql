-- ============================================================================
-- UNCHECKED ATTENDANCE REMINDERS VIEW
-- This view identifies all past sessions that need attendance marking
-- Used by AppSheet to display reminders to tutors
-- ============================================================================

DROP VIEW IF EXISTS unchecked_attendance_reminders;

CREATE VIEW unchecked_attendance_reminders AS
SELECT 
    -- Session Information
    sl.id AS reminder_id,
    sl.id AS session_id,
    sl.session_date,
    sl.time_slot,
    sl.location,
    sl.session_status,
    
    -- Tutor Information
    sl.tutor_id,
    t.tutor_name,
    t.user_email AS tutor_email,
    
    -- Student Information
    sl.student_id,
    s.student_name,
    s.school_student_id,
    CONCAT(s.grade, ' ', s.lang_stream) AS grade_stream,
    s.school,
    
    -- Urgency Indicators
    DATEDIFF(CURDATE(), sl.session_date) AS days_overdue,
    CASE 
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 7 THEN 'Critical'
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 3 THEN 'High'
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 1 THEN 'Medium'
        ELSE 'Low'
    END AS urgency_level,
    
    -- Display Formatting
    CONCAT(
        DATE_FORMAT(sl.session_date, '%d %b %Y'), ' - ',
        sl.time_slot, ' - ',
        s.student_name
    ) AS reminder_summary,
    
    -- Color coding for AppSheet
    CASE 
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 7 THEN '#FF0000'  -- Red
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 3 THEN '#FF8C00'  -- Dark Orange
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 1 THEN '#FFA500'  -- Orange
        ELSE '#FFD700'  -- Gold
    END AS urgency_color,
    
    -- Badge/Icon indicators
    CASE 
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 7 THEN '🔴'
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 3 THEN '🟠'
        WHEN DATEDIFF(CURDATE(), sl.session_date) > 1 THEN '🟡'
        ELSE '⚪'
    END AS urgency_icon,
    
    -- Metadata
    NOW() AS view_generated_at

FROM session_log sl
INNER JOIN tutors t ON sl.tutor_id = t.id
INNER JOIN students s ON sl.student_id = s.id
WHERE 
    -- Only past sessions
    sl.session_date < CURDATE()
    
    -- Only sessions that should have attendance marked
    AND sl.session_status IN (
        'Scheduled', 
        'Make-up Class', 
        'Trial Class'
        -- Note: 'Rescheduled' is excluded as these are cancelled/moved sessions
    )
    
    -- No attendance marked yet
    AND (sl.attendance_marked_by IS NULL OR sl.attendance_marked_by = '')
    
    -- Exclude very old sessions (optional - uncomment if needed)
    -- AND sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)

ORDER BY 
    sl.tutor_id,
    days_overdue DESC,  -- Most overdue first
    sl.session_date DESC,
    sl.time_slot;

-- ============================================================================
-- SUMMARY VIEW FOR DASHBOARD
-- Shows count of unchecked sessions per tutor
-- ============================================================================

DROP VIEW IF EXISTS unchecked_attendance_summary;

CREATE VIEW unchecked_attendance_summary AS
SELECT 
    t.id AS tutor_id,
    t.tutor_name,
    t.user_email AS tutor_email,
    
    -- Counts by urgency (Use COUNT(sl.id) to avoid counting NULL rows from LEFT JOIN)
    COUNT(sl.id) AS total_unchecked,
    SUM(CASE WHEN DATEDIFF(CURDATE(), sl.session_date) > 7 THEN 1 ELSE 0 END) AS critical_count,
    SUM(CASE WHEN DATEDIFF(CURDATE(), sl.session_date) BETWEEN 4 AND 7 THEN 1 ELSE 0 END) AS high_count,
    SUM(CASE WHEN DATEDIFF(CURDATE(), sl.session_date) BETWEEN 2 AND 3 THEN 1 ELSE 0 END) AS medium_count,
    SUM(CASE WHEN DATEDIFF(CURDATE(), sl.session_date) <= 1 THEN 1 ELSE 0 END) AS low_count,
    
    -- Oldest unchecked session
    MIN(sl.session_date) AS oldest_unchecked_date,
    DATEDIFF(CURDATE(), MIN(sl.session_date)) AS oldest_days_overdue,
    
    -- Display badge for AppSheet
    CASE 
        WHEN COUNT(sl.id) = 0 THEN '✅'
        WHEN MAX(DATEDIFF(CURDATE(), sl.session_date)) > 7 THEN CONCAT('🔴 ', COUNT(sl.id))
        WHEN MAX(DATEDIFF(CURDATE(), sl.session_date)) > 3 THEN CONCAT('🟠 ', COUNT(sl.id))
        ELSE CONCAT('🟡 ', COUNT(sl.id))
    END AS reminder_badge,
    
    -- Summary message
    CASE 
        WHEN COUNT(sl.id) = 0 THEN 'All attendance marked ✅'
        WHEN COUNT(sl.id) = 1 THEN CONCAT('1 session needs attendance marking')
        ELSE CONCAT(COUNT(sl.id), ' sessions need attendance marking')
    END AS summary_message,
    
    -- Priority score for sorting (Use COALESCE for NULL handling)
    (COUNT(sl.id) * 10) + COALESCE(MAX(DATEDIFF(CURDATE(), sl.session_date)), 0) AS priority_score

FROM tutors t
LEFT JOIN session_log sl ON t.id = sl.tutor_id
    AND sl.session_date < CURDATE()
    AND sl.session_status IN ('Scheduled', 'Make-up Class', 'Trial Class')
    AND (sl.attendance_marked_by IS NULL OR sl.attendance_marked_by = '')
GROUP BY t.id, t.tutor_name, t.user_email
ORDER BY priority_score DESC, total_unchecked DESC;

-- ============================================================================
-- QUICK STATS VIEW
-- For displaying on dashboard cards
-- ============================================================================

DROP VIEW IF EXISTS attendance_reminder_stats;

CREATE VIEW attendance_reminder_stats AS
SELECT 
    -- Overall stats
    COUNT(DISTINCT sl.tutor_id) AS tutors_with_reminders,
    COUNT(*) AS total_unchecked_sessions,
    
    -- By urgency
    SUM(CASE WHEN DATEDIFF(CURDATE(), sl.session_date) > 7 THEN 1 ELSE 0 END) AS critical_sessions,
    SUM(CASE WHEN DATEDIFF(CURDATE(), sl.session_date) > 3 THEN 1 ELSE 0 END) AS urgent_sessions,
    
    -- Oldest session
    MIN(sl.session_date) AS oldest_unchecked_date,
    MAX(DATEDIFF(CURDATE(), sl.session_date)) AS max_days_overdue,
    
    -- Average delay
    AVG(DATEDIFF(CURDATE(), sl.session_date)) AS avg_days_overdue

FROM session_log sl
WHERE 
    sl.session_date < CURDATE()
    AND sl.session_status IN ('Scheduled', 'Make-up Class', 'Trial Class')
    AND (sl.attendance_marked_by IS NULL OR sl.attendance_marked_by = '');

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Add indexes if not already present (these should help the views perform better)
-- Note: These may already exist, ignore duplicate key errors

-- Index for faster filtering by session_date and status
CREATE INDEX idx_session_attendance_check 
ON session_log(session_date, session_status, attendance_marked_by);

-- Index for tutor-based queries
CREATE INDEX idx_session_tutor_date 
ON session_log(tutor_id, session_date);