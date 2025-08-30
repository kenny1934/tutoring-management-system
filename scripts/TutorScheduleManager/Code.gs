/**
 * TUTOR SCHEDULE MANAGER - MAIN SCRIPT
 * 
 * Purpose: Generate and maintain weekly schedule spreadsheets for tutors
 * Database: MySQL via JDBC connection
 * Triggers: Time-driven (daily at midnight + 2PM) + Manual refresh
 * 
 * Author: CSM Pro Team
 * Created: August 2025
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Database connection (fill in your actual values)
  DB_CONNECTION_STRING: "",
  DB_USERNAME: "",
  DB_PASSWORD: "",
  
  // Schedule settings
  WEEKS_AHEAD: 2,           // Current week + 2 weeks ahead
  MAX_STUDENTS_PER_SLOT: 12, // Maximum rows allocated per time slot
  MIN_ROWS_PER_SLOT: 5,     // Minimum rows even if no students
  
  // Timing
  DELAY_BETWEEN_TUTORS: 30000, // 30 seconds delay to prevent timeout
  
  // Spreadsheet settings
  SPREADSHEET_FOLDER: "Tutor Schedules 2025", // Create this folder first
};

// ============================================================================
// MAIN ENTRY POINTS
// ============================================================================

/**
 * Main function for time-driven triggers
 * Refreshes all tutor schedules (runs at midnight and 2PM daily)
 */
function refreshAllTutorSchedules() {
  Logger.log("Starting automated refresh for all tutors...");
  const startTime = new Date();
  
  try {
    const tutors = getTutorList();
    Logger.log(`Found ${tutors.length} tutors to process`);
    
    for (let i = 0; i < tutors.length; i++) {
      try {
        Logger.log(`Processing tutor ${i+1}/${tutors.length}: ${tutors[i].tutor_name} (ID: ${tutors[i].id})`);
        refreshSingleTutorSchedule(tutors[i].id);
        
        // Delay between tutors to prevent timeout
        if (i < tutors.length - 1) {
          Logger.log(`Waiting 30 seconds before next tutor...`);
          Utilities.sleep(CONFIG.DELAY_BETWEEN_TUTORS);
        }
      } catch (error) {
        Logger.log(`ERROR processing ${tutors[i].tutor_name}: ${error.toString()}`);
        // Continue with next tutor instead of failing entire batch
      }
    }
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    Logger.log(`Completed all tutor schedule refresh in ${duration} seconds`);
    
  } catch (error) {
    Logger.log(`CRITICAL ERROR in refreshAllTutorSchedules: ${error.toString()}`);
    throw error;
  }
}

/**
 * Manual refresh function for individual tutor
 * Called by manual refresh buttons in spreadsheets
 * @param {number} tutorId - The tutor's database ID
 * @param {string} weekStart - Optional: specific week to refresh (YYYY-MM-DD)
 */
function refreshSingleTutorSchedule(tutorId, weekStart = null) {
  Logger.log(`Starting manual refresh for tutor ID: ${tutorId}`);
  
  try {
    const tutor = getTutorById(tutorId);
    if (!tutor) {
      throw new Error(`Tutor not found with ID: ${tutorId}`);
    }
    
    Logger.log(`Processing schedule for: ${tutor.tutor_name}`);
    
    // Get or create spreadsheet for this tutor
    const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
    
    // Determine which weeks to refresh
    const weeksToRefresh = weekStart ? 
      [new Date(weekStart)] : 
      getWeeksToRefresh();
    
    for (const week of weeksToRefresh) {
      Logger.log(`Refreshing week starting: ${formatDate(week)}`);
      generateWeeklySchedule(tutorId, week, spreadsheetId, tutor.tutor_name);
    }
    
    Logger.log(`Completed refresh for ${tutor.tutor_name}`);
    
  } catch (error) {
    Logger.log(`ERROR in refreshSingleTutorSchedule: ${error.toString()}`);
    throw error;
  }
}

/**
 * Generate schedule for one tutor for one week
 * @param {number} tutorId - Tutor database ID
 * @param {Date} weekStart - Monday of the week to generate
 * @param {string} spreadsheetId - Target spreadsheet ID
 * @param {string} tutorName - Tutor's name for header display
 */
function generateWeeklySchedule(tutorId, weekStart, spreadsheetId, tutorName = 'Tutor Name') {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
  
  Logger.log(`Generating schedule for tutor ${tutorId}, week ${formatDate(weekStart)} to ${formatDate(weekEnd)}`);
  Logger.log(`WeekStart day of week: ${weekStart.getDay()} (0=Sunday, 6=Saturday)`);
  Logger.log(`WeekEnd day of week: ${weekEnd.getDay()} (0=Sunday, 6=Saturday)`);
  
  try {
    // Get session data from database
    const sessions = getSessionsForTutorWeek(tutorId, weekStart, weekEnd);
    Logger.log(`Found ${sessions.length} sessions for this week`);
    
    // Process and format the data
    const scheduleData = formatScheduleData(sessions, weekStart);
    
    // Debug: Check how dates are being mapped to days
    Logger.log(`WeekStart: ${formatDate(weekStart)} (day ${weekStart.getDay()})`);
    Logger.log('Date to day mapping:');
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dayName = getDayName(date);
      Logger.log(`  ${formatDate(date)} (day ${date.getDay()}) -> ${dayName}`);
    }
    
    // Update the spreadsheet tab
    updateScheduleTab(spreadsheetId, weekStart, scheduleData, tutorName);
    
    Logger.log(`Successfully updated schedule tab for week ${formatDate(weekStart)}`);
    
  } catch (error) {
    Logger.log(`ERROR generating weekly schedule: ${error.toString()}`);
    throw error;
  }
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

/**
 * Connect to MySQL database
 * @returns {Jdbc.JdbcConnection} Database connection
 */
function connectToDatabase() {
  try {
    const conn = Jdbc.getCloudSqlConnection(
      CONFIG.DB_CONNECTION_STRING,
      CONFIG.DB_USERNAME, 
      CONFIG.DB_PASSWORD
    );
    return conn;
  } catch (error) {
    Logger.log(`Database connection failed: ${error.toString()}`);
    throw new Error(`Failed to connect to database: ${error.toString()}`);
  }
}

/**
 * Get list of all active tutors
 * @returns {Array} Array of tutor objects with id, tutor_name, user_email
 */
function getTutorList() {
  const conn = connectToDatabase();
  
  try {
    const stmt = conn.prepareStatement(
      "SELECT id, tutor_name, user_email, default_location FROM tutors ORDER BY tutor_name"
    );
    const results = stmt.executeQuery();
    
    const tutors = [];
    while (results.next()) {
      tutors.push({
        id: results.getInt("id"),
        tutor_name: results.getString("tutor_name"),
        user_email: results.getString("user_email"),
        default_location: results.getString("default_location")
      });
    }
    
    results.close();
    stmt.close();
    
    return tutors;
    
  } finally {
    conn.close();
  }
}

/**
 * Get single tutor by ID
 * @param {number} tutorId - Tutor database ID
 * @returns {Object} Tutor object or null if not found
 */
function getTutorById(tutorId) {
  const conn = connectToDatabase();
  
  try {
    const stmt = conn.prepareStatement(
      "SELECT id, tutor_name, user_email, default_location FROM tutors WHERE id = ?"
    );
    stmt.setInt(1, tutorId);
    const results = stmt.executeQuery();
    
    let tutor = null;
    if (results.next()) {
      tutor = {
        id: results.getInt("id"),
        tutor_name: results.getString("tutor_name"),
        user_email: results.getString("user_email"),
        default_location: results.getString("default_location")
      };
    }
    
    results.close();
    stmt.close();
    
    return tutor;
    
  } finally {
    conn.close();
  }
}

/**
 * Get all sessions for a tutor within a date range
 * @param {number} tutorId - Tutor database ID
 * @param {Date} startDate - Start of date range
 * @param {Date} endDate - End of date range
 * @returns {Array} Array of session objects with student details
 */
function getSessionsForTutorWeek(tutorId, startDate, endDate) {
  const conn = connectToDatabase();
  
  try {
    const stmt = conn.prepareStatement(`
      SELECT 
        sl.id as session_id,
        sl.session_date,
        sl.time_slot,
        sl.location,
        sl.session_status,
        sl.financial_status,
        sl.attendance_marked_by,
        sl.notes,
        s.school_student_id,
        s.student_name,
        s.grade,
        s.lang_stream,
        s.school
      FROM session_log sl
      JOIN students s ON sl.student_id = s.id
      WHERE sl.tutor_id = ? 
        AND sl.session_date BETWEEN ? AND ?
      ORDER BY sl.session_date, sl.time_slot, s.student_name
    `);
    
    stmt.setInt(1, tutorId);
    
    // Use string dates to avoid timezone issues with JDBC
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);
    
    Logger.log(`SQL Query Debug:`);
    Logger.log(`  tutorId: ${tutorId}`);
    Logger.log(`  startDateStr: '${startDateStr}'`);
    Logger.log(`  endDateStr: '${endDateStr}'`);
    
    stmt.setString(2, startDateStr);
    stmt.setString(3, endDateStr);
    
    const results = stmt.executeQuery();
    const sessions = [];
    
    while (results.next()) {
      sessions.push({
        session_id: results.getInt("session_id"),
        session_date: new Date(results.getDate("session_date").getTime()),
        time_slot: results.getString("time_slot"),
        location: results.getString("location"),
        session_status: results.getString("session_status"),
        financial_status: results.getString("financial_status"),
        attendance_marked_by: results.getString("attendance_marked_by"),
        notes: results.getString("notes"),
        school_student_id: results.getString("school_student_id"),
        student_name: results.getString("student_name"),
        grade: results.getString("grade"),
        lang_stream: results.getString("lang_stream"),
        school: results.getString("school")
      });
    }
    
    results.close();
    stmt.close();
    
    Logger.log(`Retrieved ${sessions.length} sessions for tutor ${tutorId}`);
    
    // Debug: Log sessions by date to identify missing Saturday
    const sessionsByDate = {};
    sessions.forEach(session => {
      const dateKey = formatDate(session.session_date);
      if (!sessionsByDate[dateKey]) sessionsByDate[dateKey] = [];
      sessionsByDate[dateKey].push(session.student_name);
    });
    
    Logger.log('Sessions by date:');
    Object.keys(sessionsByDate).sort().forEach(date => {
      Logger.log(`  ${date}: ${sessionsByDate[date].length} sessions (${sessionsByDate[date].join(', ')})`);
    });
    
    return sessions;
    
  } finally {
    conn.close();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get array of Sunday dates for weeks to refresh
 * @returns {Array<Date>} Array of Sunday dates (current + 2 weeks ahead)
 */
function getWeeksToRefresh() {
  const weeks = [];
  const today = new Date();
  
  // Get Sunday of current week
  const currentSunday = getSundayOfWeek(today);
  
  // Debug: Log the Sunday calculation
  Logger.log(`Today: ${formatDate(today)} (day ${today.getDay()})`);
  Logger.log(`Calculated Sunday: ${formatDate(currentSunday)} (day ${currentSunday.getDay()})`);
  
  // Add current week + WEEKS_AHEAD
  for (let i = 0; i <= CONFIG.WEEKS_AHEAD; i++) {
    const sunday = new Date(currentSunday);
    sunday.setDate(sunday.getDate() + (i * 7));
    weeks.push(sunday);
  }
  
  return weeks;
}

/**
 * Get Sunday of the week for given date (week starts on Sunday)
 * @param {Date} date - Any date in the week
 * @returns {Date} Sunday of that week
 */
function getSundayOfWeek(date) {
  // Create date in local timezone to avoid UTC conversion issues
  const inputDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = inputDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  Logger.log(`DEBUG getSundayOfWeek: Input local date: ${inputDate.toString()}, dayOfWeek: ${dayOfWeek}`);
  
  // If it's already Sunday, return the same date
  if (dayOfWeek === 0) {
    return inputDate;
  }
  
  // For other days, go back to the previous Sunday
  const sunday = new Date(inputDate);
  sunday.setDate(inputDate.getDate() - dayOfWeek);
  Logger.log(`DEBUG: Calculated Sunday: ${sunday.toString()}, dayOfWeek now: ${sunday.getDay()}`);
  
  return sunday;
}

/**
 * Format date as YYYY-MM-DD string (timezone-aware)
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  // Use local timezone instead of UTC to avoid timezone conversion
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for display in tab names (e.g., "0831-0906")
 * @param {Date} sunday - Sunday of the week
 * @returns {string} Formatted week label as MMDD-MMDD
 */
function formatWeekLabel(sunday) {
  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);
  
  const formatDate = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}${day}`;
  };
  
  return `${formatDate(sunday)}-${formatDate(saturday)}`;
}

// ============================================================================
// TEST FUNCTIONS (for development)
// ============================================================================

/**
 * Test function - refresh single tutor for development
 */
function testSingleTutor() {
  // Test with tutor ID 1 (change this to match your database)
  refreshSingleTutorSchedule(1);
}

/**
 * Test function - get tutor list
 */
function testGetTutors() {
  const tutors = getTutorList();
  Logger.log("Tutors found:");
  tutors.forEach(tutor => {
    Logger.log(`ID: ${tutor.id}, Name: ${tutor.tutor_name}, Email: ${tutor.user_email}`);
  });
}

/**
 * Test function - database connection
 */
function testDatabaseConnection() {
  try {
    const conn = connectToDatabase();
    Logger.log("Database connection successful!");
    conn.close();
  } catch (error) {
    Logger.log(`Database connection failed: ${error.toString()}`);
  }
}

/**
 * Test function - verify Sunday calculation
 */
function testSundayCalculation() {
  // Test with both string and explicit constructors  
  const testCases = [
    { name: 'Sat Aug 23', date: new Date('2025-08-23') },
    { name: 'Sun Aug 24', date: new Date('2025-08-24') },
    { name: 'Mon Aug 25', date: new Date('2025-08-25') },
    { name: 'Fri Aug 29', date: new Date('2025-08-29') },
    { name: 'Sat Aug 30', date: new Date('2025-08-30') },
  ];
  
  Logger.log('Testing Sunday calculation with timezone-aware fix:');
  testCases.forEach(testCase => {
    Logger.log(`\n--- Testing ${testCase.name} ---`);
    const sunday = getSundayOfWeek(testCase.date);
    Logger.log(`Result: ${formatDate(testCase.date)} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][testCase.date.getDay()]}) -> ${formatDate(sunday)} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][sunday.getDay()]})`);
  });
}