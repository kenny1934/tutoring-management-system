/**
 * SPREADSHEET MANAGEMENT FUNCTIONS
 * 
 * Handles creation and updating of tutor spreadsheets and tabs
 */

/**
 * onOpen trigger function - automatically called when spreadsheet is opened
 * Sets up custom menu for manual refresh functionality
 */
function onOpen() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    setupManualRefreshMenu(spreadsheet);
  } catch (error) {
    Logger.log(`Error in onOpen trigger: ${error.toString()}`);
  }
}

// ============================================================================
// SPREADSHEET CREATION & MANAGEMENT
// ============================================================================

/**
 * Get existing spreadsheet ID for tutor, or create new one
 * @param {Object} tutor - Tutor object with id, tutor_name, user_email
 * @returns {string} Spreadsheet ID
 */
function getOrCreateTutorSpreadsheet(tutor) {
  const spreadsheetName = `${tutor.tutor_name} - Schedule 2025`;
  
  try {
    // Try to find existing spreadsheet
    const files = DriveApp.getFilesByName(spreadsheetName);
    
    if (files.hasNext()) {
      const file = files.next();
      Logger.log(`Found existing spreadsheet: ${spreadsheetName}`);
      return file.getId();
    } else {
      // Create new spreadsheet
      Logger.log(`Creating new spreadsheet: ${spreadsheetName}`);
      return createTutorSpreadsheet(tutor);
    }
    
  } catch (error) {
    Logger.log(`Error accessing spreadsheet ${spreadsheetName}: ${error.toString()}`);
    throw error;
  }
}

/**
 * Create new spreadsheet for tutor with basic setup
 * @param {Object} tutor - Tutor object
 * @returns {string} New spreadsheet ID
 */
function createTutorSpreadsheet(tutor) {
  try {
    // Create new spreadsheet
    const spreadsheet = SpreadsheetApp.create(`${tutor.tutor_name} - Schedule 2025`);
    const spreadsheetId = spreadsheet.getId();
    
    // Share with tutor (view access)
    DriveApp.getFileById(spreadsheetId).addViewer(tutor.user_email);
    Logger.log(`Shared spreadsheet with tutor: ${tutor.user_email}`);
    
    // Create initial week tabs FIRST
    const weeks = getWeeksToRefresh();
    for (const week of weeks) {
      createWeeklyTab(spreadsheetId, week);
    }
    
    // Then delete the default "Sheet1" (now that we have other tabs)
    const defaultSheet = spreadsheet.getSheetByName("Sheet1");
    if (defaultSheet) {
      spreadsheet.deleteSheet(defaultSheet);
    }
    
    Logger.log(`Created new spreadsheet for ${tutor.tutor_name}: ${spreadsheetId}`);
    return spreadsheetId;
    
  } catch (error) {
    Logger.log(`Error creating spreadsheet for ${tutor.tutor_name}: ${error.toString()}`);
    throw error;
  }
}

/**
 * Create or update a weekly tab in the spreadsheet
 * @param {string} spreadsheetId - Target spreadsheet ID  
 * @param {Date} weekStart - Monday of the week
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The created/updated sheet
 */
function createWeeklyTab(spreadsheetId, weekStart) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const tabName = formatWeekLabel(weekStart);
  
  try {
    // Check if tab already exists
    let sheet = spreadsheet.getSheetByName(tabName);
    
    if (!sheet) {
      // Create new tab
      sheet = spreadsheet.insertSheet(tabName);
      Logger.log(`Created new tab: ${tabName}`);
    } else {
      Logger.log(`Using existing tab: ${tabName}`);
    }
    
    // Set up the basic template structure
    setupWeeklyTabTemplate(sheet, weekStart);
    
    // Highlight current week tab in green
    if (isCurrentWeek(weekStart)) {
      sheet.setTabColor('#34A853'); // Google green
      
      // Move current week tab to first position
      spreadsheet.setActiveSheet(sheet);
      spreadsheet.moveActiveSheet(1);
    }
    
    return sheet;
    
  } catch (error) {
    Logger.log(`Error creating/updating tab ${tabName}: ${error.toString()}`);
    throw error;
  }
}

/**
 * Set up the basic template for a weekly schedule tab
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to set up
 * @param {Date} weekStart - Monday of the week
 */
function setupWeeklyTabTemplate(sheet, weekStart) {
  try {
    // Clear existing content
    sheet.clear();
    
    // Set up column widths
    sheet.setColumnWidth(1, 100);  // Time column
    for (let col = 2; col <= 8; col++) {
      sheet.setColumnWidth(col, 150); // Day columns
    }
    
    // Create header row (Sunday first)
    const headers = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    sheet.getRange(1, 1, 1, 8).setValues([headers]);
    
    // Create date row (Sunday first)
    const dates = [''];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      dates.push(formatDateForHeader(date));
    }
    sheet.getRange(2, 1, 1, 8).setValues([dates]);
    
    // Format header rows
    const headerRange = sheet.getRange(1, 1, 2, 8);
    headerRange.setBackground('#E8F0FE');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    headerRange.setBorder(true, true, true, true, true, true);
    
    // Add manual refresh button
    addManualRefreshButton(sheet, weekStart);
    
    Logger.log(`Set up template for ${formatWeekLabel(weekStart)}`);
    
  } catch (error) {
    Logger.log(`Error setting up template: ${error.toString()}`);
    throw error;
  }
}

/**
 * Update a specific weekly tab with schedule data
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Date} weekStart - Monday of the week
 * @param {Object} scheduleData - Processed schedule data
 * @param {string} tutorName - Tutor's name for header display
 */
function updateScheduleTab(spreadsheetId, weekStart, scheduleData, tutorName = 'Tutor Name') {
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const tabName = formatWeekLabel(weekStart);
    
    // Create tab if it doesn't exist
    let sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) {
      sheet = createWeeklyTab(spreadsheetId, weekStart);
    }
    
    // Clear existing schedule data (preserve header rows)
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow > 2) {
      sheet.getRange(3, 1, lastRow - 2, lastCol || 8).clear();
    }
    
    // Use the exact screenshot layout system
    createExactScreenshotLayout(sheet, scheduleData, tutorName);
    
    Logger.log(`Updated schedule tab: ${tabName}`);
    
  } catch (error) {
    Logger.log(`Error updating schedule tab: ${error.toString()}`);
    throw error;
  }
}

/**
 * Insert schedule data into the sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Object} scheduleData - Processed schedule data
 */
function insertScheduleData(sheet, scheduleData) {
  let currentRow = 3; // Start after header rows
  
  // Sort time slots chronologically
  const sortedTimeSlots = sortTimeSlots(Object.keys(scheduleData.timeSlots));
  
  for (const timeSlot of sortedTimeSlots) {
    const slotData = scheduleData.timeSlots[timeSlot];
    
    // Find maximum students in any day for this time slot
    const maxStudentsPerDay = Math.max(...Object.values(slotData.days).map(day => day.students.length), 0);
    const studentsRowsNeeded = Math.max(maxStudentsPerDay, 3); // Minimum 3 student rows per slot
    
    // Create time slot section
    createTimeSlotSection(sheet, currentRow, timeSlot, slotData, studentsRowsNeeded);
    
    // Move to next section (class grade row + student rows + spacing)
    currentRow += 1 + studentsRowsNeeded + 1; // +1 for grade row, +1 for spacing
  }
}

/**
 * Create a complete time slot section with proper formatting
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row for this time slot
 * @param {string} timeSlot - Time slot string
 * @param {Object} slotData - Data for this time slot
 * @param {number} studentRows - Number of student rows to create
 */
function createTimeSlotSection(sheet, startRow, timeSlot, slotData, studentRows) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  // Row 1: Class grade row with time slot
  const gradeRowData = [timeSlot]; // Time in first column
  for (const dayName of days) {
    const dayData = slotData.days[dayName];
    gradeRowData.push(dayData.classGrade || '');
  }
  sheet.getRange(startRow, 1, 1, 8).setValues([gradeRowData]);
  
  // Format the class grade row
  const gradeRowRange = sheet.getRange(startRow, 1, 1, 8);
  gradeRowRange.setBackground('#E8F0FE');
  gradeRowRange.setFontWeight('bold');
  gradeRowRange.setHorizontalAlignment('center');
  gradeRowRange.setBorder(true, true, true, true, true, true);
  
  // Student rows
  for (let studentRowIndex = 0; studentRowIndex < studentRows; studentRowIndex++) {
    const rowNum = startRow + 1 + studentRowIndex;
    
    // Create student data row
    const studentRowData = ['']; // Empty time column for student rows
    
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayName = days[dayIndex];
      const dayData = slotData.days[dayName];
      
      if (dayData.students[studentRowIndex]) {
        const student = dayData.students[studentRowIndex];
        studentRowData.push(formatStudentCell(student));
      } else {
        studentRowData.push('');
      }
    }
    
    sheet.getRange(rowNum, 1, 1, 8).setValues([studentRowData]);
    
    // Create status indicator rows (underneath each student row)
    createStatusIndicatorRow(sheet, rowNum + 0.5, slotData, studentRowIndex, days);
  }
  
  // Add borders around the entire time slot section
  const sectionRange = sheet.getRange(startRow, 1, 1 + studentRows, 8);
  sectionRange.setBorder(true, true, true, true, true, true, '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Create status indicator row with two-box system
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet  
 * @param {number} rowNum - Row number for status indicators
 * @param {Object} slotData - Time slot data
 * @param {number} studentIndex - Which student in the list
 * @param {Array} days - Array of day names
 */
function createStatusIndicatorRow(sheet, rowNum, slotData, studentIndex, days) {
  // This is a visual approximation since we can't create half-rows
  // We'll use conditional formatting and cell formatting instead
  // The status indicators will be integrated into the student cell formatting
  
  // Apply conditional formatting based on session status
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayName = days[dayIndex];
    const dayData = slotData.days[dayName];
    
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      const cellRange = sheet.getRange(Math.floor(rowNum), dayIndex + 2); // +2 because col 1 is time
      
      // Apply status-based formatting
      applyCellStatusFormatting(cellRange, student);
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format student information for display in cell (clean format without status indicators)
 * @param {Object} student - Student session object
 * @returns {string} Formatted student string
 */
function formatStudentCell(student) {
  // Format: [school_student_id] [student_name] [grade][langstream] [school]
  const parts = [];
  
  if (student.school_student_id) parts.push(student.school_student_id);
  if (student.student_name) parts.push(student.student_name);
  if (student.grade && student.lang_stream) parts.push(`${student.grade}${student.lang_stream}`);
  if (student.school) parts.push(student.school);
  
  return parts.join(' ');
}

/**
 * Get lesson status indicator (left box)
 * @param {string} sessionStatus - Session status from database
 * @returns {string} Status indicator character
 */
function getLessonStatusIndicator(sessionStatus) {
  if (!sessionStatus) return '';
  
  const status = sessionStatus.toLowerCase();
  
  if (status.includes('rescheduled')) return 'R';
  if (status.includes('make-up') || status.includes('makeup')) return 'M';
  if (status.includes('sick')) return 'S';
  if (status.includes('trial')) return 'T';
  if (status.includes('confirmed') || status.includes('confirm')) return '?';
  
  return ''; // Default for 'Scheduled'
}

/**
 * Get attendance status indicator (right box)
 * @param {string} sessionStatus - Session status from database
 * @param {string} attendanceMarkedBy - Who marked attendance
 * @returns {string} Attendance indicator character
 */
function getAttendanceStatusIndicator(sessionStatus, attendanceMarkedBy) {
  if (!sessionStatus) return '';
  
  const status = sessionStatus.toLowerCase();
  
  if (status.includes('attended')) return '✓';
  if (status.includes('no show')) return 'X';
  
  return ''; // Not yet marked
}

/**
 * Check if given week is the current week (GMT+8 timezone)
 * @param {Date} weekStart - Sunday of the week to check
 * @returns {boolean} True if it's the current week
 */
function isCurrentWeek(weekStart) {
  // Get current date in GMT+8 timezone
  const now = new Date();
  const gmt8Offset = 8 * 60; // GMT+8 in minutes
  const localOffset = now.getTimezoneOffset(); // Local timezone offset from UTC
  const gmt8Time = new Date(now.getTime() + (gmt8Offset + localOffset) * 60000);
  
  const currentWeekStart = getSundayOfWeek(gmt8Time);
  
  return weekStart.getTime() === currentWeekStart.getTime();
}

/**
 * Format date for header display (e.g., "Mar 3")
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDateForHeader(date) {
  const options = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Add manual refresh instruction to sheet and set up menu
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Date} weekStart - Monday of the week
 */
function addManualRefreshButton(sheet, weekStart) {
  // Add instruction text for users
  sheet.getRange(1, 10).setValue('Refresh: Menu > Tutor Schedule > Refresh This Week');
  sheet.getRange(1, 10).setFontSize(10);
  sheet.getRange(1, 10).setFontColor('#666666');
  
  // Set up the custom menu (this will be called when spreadsheet is opened)
  const spreadsheet = sheet.getParent();
  setupManualRefreshMenu(spreadsheet);
}

/**
 * Set up manual refresh menu for tutor spreadsheets
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Target spreadsheet
 */
function setupManualRefreshMenu(spreadsheet) {
  try {
    // Get tutor ID from spreadsheet properties or title
    const tutorId = getTutorIdFromSpreadsheet(spreadsheet);
    
    // Store tutor ID in spreadsheet properties for menu functions to access
    PropertiesService.getDocumentProperties().setProperty('TUTOR_ID', tutorId.toString());
    
    // Create the custom menu
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('Tutor Schedule')
      .addItem('Refresh This Week', 'refreshCurrentWeek')
      .addItem('Refresh All Weeks', 'refreshAllWeeks')
      .addToUi();
      
    Logger.log(`Manual refresh menu set up for tutor ID: ${tutorId}`);
    
  } catch (error) {
    Logger.log(`Error setting up manual refresh menu: ${error.toString()}`);
  }
}

/**
 * Extract tutor ID from spreadsheet (from title or properties)
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Target spreadsheet
 * @returns {number} Tutor ID
 */
function getTutorIdFromSpreadsheet(spreadsheet) {
  // First try to get from properties
  const properties = PropertiesService.getDocumentProperties();
  const storedTutorId = properties.getProperty('TUTOR_ID');
  
  if (storedTutorId) {
    return parseInt(storedTutorId);
  }
  
  // If not in properties, try to extract from spreadsheet title
  // Title format: "[Tutor Name] - Schedule 2025"
  // We'll need to look up tutor by name (this is a fallback method)
  const title = spreadsheet.getName();
  const tutorName = title.replace(' - Schedule 2025', '');
  
  // This would require a database lookup - for now return 1 as default
  // In production, implement proper tutor ID lookup
  Logger.log(`Could not determine tutor ID for spreadsheet: ${title}, using default ID 1`);
  return 1;
}

/**
 * Manual refresh function for current week (called from custom menu)
 */
function refreshCurrentWeek() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = SpreadsheetApp.getActiveSheet();
    const tutorId = parseInt(PropertiesService.getDocumentProperties().getProperty('TUTOR_ID')) || 1;
    
    // Extract week start from tab name (format: "MMDD-MMDD")
    const tabName = sheet.getName();
    const weekStart = getWeekStartFromTabName(tabName);
    
    if (!weekStart) {
      SpreadsheetApp.getUi().alert('Could not determine week from tab name. Please make sure you are on a weekly schedule tab.');
      return;
    }
    
    // Show progress message
    SpreadsheetApp.getUi().alert('Refreshing schedule... This may take a moment.');
    
    // Call the refresh function
    refreshSingleTutorSchedule(tutorId, formatDate(weekStart));
    
    // Success message
    SpreadsheetApp.getUi().alert('Schedule refreshed successfully!');
    
  } catch (error) {
    Logger.log(`Error in manual refresh: ${error.toString()}`);
    SpreadsheetApp.getUi().alert(`Error refreshing schedule: ${error.toString()}`);
  }
}

/**
 * Manual refresh function for all weeks (called from custom menu)
 */
function refreshAllWeeks() {
  try {
    const tutorId = parseInt(PropertiesService.getDocumentProperties().getProperty('TUTOR_ID')) || 1;
    
    // Show progress message
    SpreadsheetApp.getUi().alert('Refreshing all weeks... This may take a few minutes.');
    
    // Call the refresh function without specific week (refreshes all weeks)
    refreshSingleTutorSchedule(tutorId);
    
    // Success message
    SpreadsheetApp.getUi().alert('All weeks refreshed successfully!');
    
  } catch (error) {
    Logger.log(`Error in manual refresh all: ${error.toString()}`);
    SpreadsheetApp.getUi().alert(`Error refreshing all weeks: ${error.toString()}`);
  }
}

/**
 * Extract week start date from tab name
 * @param {string} tabName - Tab name in format "MMDD-MMDD"
 * @returns {Date|null} Week start date or null if parsing fails
 */
function getWeekStartFromTabName(tabName) {
  try {
    // Tab name format: "0901-0907" (September 1 to September 7)
    const match = tabName.match(/(\d{2})(\d{2})-(\d{2})(\d{2})/);
    if (!match) {
      return null;
    }
    
    const [, startMonth, startDay] = match;
    const currentYear = new Date().getFullYear();
    
    // Create date for the week start (Sunday)
    const weekStart = new Date(currentYear, parseInt(startMonth) - 1, parseInt(startDay));
    
    return weekStart;
    
  } catch (error) {
    Logger.log(`Error parsing tab name ${tabName}: ${error.toString()}`);
    return null;
  }
}

/**
 * Apply conditional formatting to the schedule sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Object} scheduleData - Schedule data for reference
 */
function formatScheduleSheet(sheet, scheduleData) {
  // Apply overall formatting
  const dataRange = sheet.getDataRange();
  if (dataRange.getNumRows() > 2) {
    // Set default font and borders
    dataRange.setFontFamily('Arial');
    dataRange.setFontSize(10);
  }
  
  // Apply time column formatting
  const timeColumnRange = sheet.getRange(3, 1, sheet.getLastRow() - 2, 1);
  timeColumnRange.setFontWeight('bold');
  timeColumnRange.setVerticalAlignment('middle');
}

/**
 * Apply status-based formatting to a cell
 * @param {GoogleAppsScript.Spreadsheet.Range} cellRange - Target cell
 * @param {Object} student - Student session object
 */
function applyCellStatusFormatting(cellRange, student) {
  const sessionStatus = student.session_status || '';
  
  // Background color based on session type
  const backgroundColor = getStatusColor(sessionStatus);
  cellRange.setBackground(backgroundColor);
  
  // Strikethrough for rescheduled/no show
  if (shouldStrikethrough(sessionStatus)) {
    cellRange.setFontLine('line-through');
  }
  
  // Add status indicators as cell note/comment
  const lessonStatus = getLessonStatusIndicator(sessionStatus);
  const attendanceStatus = getAttendanceStatusIndicator(sessionStatus, student.attendance_marked_by);
  
  if (lessonStatus || attendanceStatus) {
    const statusNote = `Status: ${lessonStatus || '-'} | Attendance: ${attendanceStatus || '-'}`;
    cellRange.setNote(statusNote);
  }
}

/**
 * Sort time slots chronologically (moved from DataProcessor for access)
 * @param {Array} timeSlots - Array of time slot strings
 * @returns {Array} Sorted time slot strings
 */
function sortTimeSlots(timeSlots) {
  return timeSlots.sort((a, b) => {
    const parseTime = (timeStr) => {
      const match = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        return parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      return 0;
    };
    
    return parseTime(a) - parseTime(b);
  });
}