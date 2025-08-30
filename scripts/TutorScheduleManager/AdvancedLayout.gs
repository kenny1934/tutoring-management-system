/**
 * ADVANCED LAYOUT SYSTEM
 * 
 * Creates the sophisticated layout that matches the tutor schedule screenshot
 * This replaces the basic layout system with proper visual structure
 */

// ============================================================================
// ENHANCED LAYOUT ENGINE
// ============================================================================

/**
 * Create the advanced schedule layout that matches the screenshot format
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Object} scheduleData - Processed schedule data
 */
function createAdvancedScheduleLayout(sheet, scheduleData) {
  Logger.log('Creating advanced schedule layout...');
  
  // Debug: Check schedule data
  Logger.log(`Schedule data keys: ${Object.keys(scheduleData)}`);
  Logger.log(`Time slots found: ${Object.keys(scheduleData.timeSlots || {}).length}`);
  
  // Clear existing content (preserve headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(3, 1, lastRow - 2, 8).clear();
  }
  
  let currentRow = 3;
  
  // Get sorted time slots
  const sortedTimeSlots = sortTimeSlots(Object.keys(scheduleData.timeSlots || {}));
  Logger.log(`Sorted time slots: ${sortedTimeSlots}`);
  
  if (sortedTimeSlots.length === 0) {
    Logger.log('No time slots found - creating empty schedule message');
    sheet.getRange(3, 1, 1, 8).setValues([['No sessions scheduled for this week', '', '', '', '', '', '', '']]);
    applyAdvancedFormatting(sheet);
    return;
  }
  
  for (const timeSlot of sortedTimeSlots) {
    const slotData = scheduleData.timeSlots[timeSlot];
    Logger.log(`Processing time slot: ${timeSlot}`);
    
    // Create the time slot block
    currentRow = createTimeSlotBlock(sheet, currentRow, timeSlot, slotData);
    
    // Add spacing between time slots
    currentRow += 1;
  }
  
  // Apply final formatting
  applyAdvancedFormatting(sheet);
  
  Logger.log(`Advanced layout created with ${sortedTimeSlots.length} time slots`);
}

/**
 * Create a complete time slot block with proper visual structure
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {string} timeSlot - Time slot string
 * @param {Object} slotData - Time slot data
 * @returns {number} Next available row
 */
function createTimeSlotBlock(sheet, startRow, timeSlot, slotData) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  // Find max students for this time slot
  const maxStudents = Math.max(...days.map(day => slotData.days[day].students.length), 0);
  const studentRows = Math.max(maxStudents, 2); // Minimum 2 rows per time slot
  
  // Create time slot header with class grades
  createTimeSlotHeader(sheet, startRow, timeSlot, slotData, days);
  
  // Create student sections for each day
  for (let studentIndex = 0; studentIndex < studentRows; studentIndex++) {
    const rowNum = startRow + 1 + (studentIndex * 2); // *2 because each student takes 2 rows
    
    // Student name row
    createStudentNameRow(sheet, rowNum, slotData, studentIndex, days);
    
    // Status indicator row (the two-box system)
    createStatusIndicatorRow(sheet, rowNum + 1, slotData, studentIndex, days);
  }
  
  // Add time slot borders
  const blockHeight = 1 + (studentRows * 2); // header + (students * 2 rows each)
  addTimeSlotBorders(sheet, startRow, blockHeight);
  
  return startRow + blockHeight;
}

/**
 * Create the time slot header row with class grades
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {string} timeSlot - Time slot string
 * @param {Object} slotData - Time slot data
 * @param {Array} days - Day names array
 */
function createTimeSlotHeader(sheet, row, timeSlot, slotData, days) {
  // Format time slot for display (extract start time only)
  const displayTime = extractStartTime(timeSlot);
  
  // Create header row data
  const headerData = [displayTime]; // Time in first column
  
  for (const dayName of days) {
    const dayData = slotData.days[dayName];
    headerData.push(dayData.classGrade || '');
  }
  
  // Set the data
  sheet.getRange(row, 1, 1, 8).setValues([headerData]);
  
  // Format header row
  const headerRange = sheet.getRange(row, 1, 1, 8);
  headerRange.setBackground('#E8F0FE'); // Light blue background
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setBorder(true, true, true, true, true, true, '#4285F4', SpreadsheetApp.BorderStyle.SOLID);
  
  // Make time column slightly different
  sheet.getRange(row, 1).setBackground('#D1E7DD'); // Light green for time
}

/**
 * Create student name row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {Object} slotData - Time slot data
 * @param {number} studentIndex - Student index
 * @param {Array} days - Day names array
 */
function createStudentNameRow(sheet, row, slotData, studentIndex, days) {
  const studentRowData = ['']; // Empty time column
  
  for (const dayName of days) {
    const dayData = slotData.days[dayName];
    
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      studentRowData.push(formatStudentNameOnly(student));
    } else {
      studentRowData.push('');
    }
  }
  
  // Set the data
  sheet.getRange(row, 1, 1, 8).setValues([studentRowData]);
  
  // Format student name row
  const nameRange = sheet.getRange(row, 1, 1, 8);
  nameRange.setFontSize(9);
  nameRange.setVerticalAlignment('bottom');
  
  // Apply conditional formatting based on session status
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const dayData = slotData.days[days[dayIndex]];
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      const cellRange = sheet.getRange(row, dayIndex + 2); // +2 for time column
      
      // Apply background color and strikethrough
      applyCellStatusFormatting(cellRange, student);
    }
  }
}

/**
 * Create the two-box status indicator row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {Object} slotData - Time slot data
 * @param {number} studentIndex - Student index
 * @param {Array} days - Day names array
 */
function createStatusIndicatorRow(sheet, row, slotData, studentIndex, days) {
  const statusRowData = ['']; // Empty time column
  
  for (const dayName of days) {
    const dayData = slotData.days[dayName];
    
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      
      // Create the two-box format: "R ✓" or "M X" etc.
      const lessonStatus = getLessonStatusIndicator(student.session_status);
      const attendanceStatus = getAttendanceStatusIndicator(student.session_status, student.attendance_marked_by);
      
      const statusText = `${lessonStatus || ' '} ${attendanceStatus || ' '}`.trim();
      statusRowData.push(statusText);
    } else {
      statusRowData.push('');
    }
  }
  
  // Set the data
  sheet.getRange(row, 1, 1, 8).setValues([statusRowData]);
  
  // Format status row
  const statusRange = sheet.getRange(row, 1, 1, 8);
  statusRange.setFontSize(8);
  statusRange.setFontWeight('bold');
  statusRange.setHorizontalAlignment('center');
  statusRange.setVerticalAlignment('top');
  
  // Apply status-specific colors
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const dayData = slotData.days[days[dayIndex]];
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      const cellRange = sheet.getRange(row, dayIndex + 2);
      
      // Color code the status indicators
      const lessonStatus = getLessonStatusIndicator(student.session_status);
      if (lessonStatus === 'R') {
        cellRange.setBackground('#FFE6CC'); // Light orange for rescheduled
      } else if (lessonStatus === 'M') {
        cellRange.setBackground('#FFF2CC'); // Light yellow for make-up
      } else if (lessonStatus === 'S') {
        cellRange.setBackground('#F4CCCC'); // Light red for sick
      } else if (lessonStatus === 'T') {
        cellRange.setBackground('#D0E0E3'); // Light blue for trial
      }
    }
  }
}

/**
 * Add borders around a time slot block
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {number} height - Block height
 */
function addTimeSlotBorders(sheet, startRow, height) {
  const blockRange = sheet.getRange(startRow, 1, height, 8);
  blockRange.setBorder(true, true, true, true, true, true, '#666666', SpreadsheetApp.BorderStyle.SOLID);
  
  // Add thicker border around the entire block
  blockRange.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/**
 * Apply advanced formatting to the entire sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function applyAdvancedFormatting(sheet) {
  // Set overall sheet properties
  sheet.setFrozenRows(2); // Freeze header rows
  sheet.setFrozenColumns(1); // Freeze time column
  
  // Format time column (only if there are data rows)
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    const timeColumn = sheet.getRange(3, 1, lastRow - 2, 1);
    timeColumn.setFontWeight('bold');
    timeColumn.setFontSize(10);
    timeColumn.setVerticalAlignment('middle');
    timeColumn.setHorizontalAlignment('center');
    timeColumn.setBackground('#F8F9FA');
  }
  
  // Set column widths for better display
  sheet.setColumnWidth(1, 80);  // Time column
  for (let col = 2; col <= 8; col++) {
    sheet.setColumnWidth(col, 140); // Day columns
  }
  
  // Set row heights for better readability (only if there are data rows)
  const totalRows = sheet.getLastRow();
  if (totalRows > 2) {
    for (let row = 3; row <= totalRows; row++) {
      sheet.setRowHeight(row, 25);
    }
  }
}

// ============================================================================
// ENHANCED FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format student name without status indicators
 * @param {Object} student - Student session object
 * @returns {string} Clean student name format
 */
function formatStudentNameOnly(student) {
  const parts = [];
  
  if (student.school_student_id) parts.push(student.school_student_id);
  if (student.student_name) parts.push(student.student_name);
  if (student.grade && student.lang_stream) parts.push(`${student.grade}${student.lang_stream}`);
  
  return parts.join(' ');
}

/**
 * Enhanced status indicator with proper two-box format
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
  if (status.includes('to be confirmed') || status.includes('confirm')) return '?';
  
  return ''; // Default for 'Scheduled'
}

/**
 * Enhanced attendance indicator
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
 * Enhanced cell formatting with better colors
 * @param {GoogleAppsScript.Spreadsheet.Range} cellRange - Target cell
 * @param {Object} student - Student session object
 */
function applyCellStatusFormatting(cellRange, student) {
  const sessionStatus = student.session_status || '';
  
  // Apply strikethrough for rescheduled/no show
  if (shouldStrikethrough(sessionStatus)) {
    cellRange.setFontLine('line-through');
    cellRange.setFontColor('#999999'); // Gray text
  }
  
  // Set background based on financial status
  if (student.financial_status === 'Unpaid') {
    cellRange.setBackground('#FFF3E0'); // Very light orange for unpaid
  }
}

/**
 * Check if session should have strikethrough
 * @param {string} sessionStatus - Session status
 * @returns {boolean} True if should be struck through
 */
function shouldStrikethrough(sessionStatus) {
  if (!sessionStatus) return false;
  const status = sessionStatus.toLowerCase();
  return status.includes('rescheduled') || status.includes('no show');
}

/**
 * Extract start time from time slot string for display
 * @param {string} timeSlot - Time slot like "10:00 - 11:30"
 * @returns {string} Start time like "10:00"
 */
function extractStartTime(timeSlot) {
  if (!timeSlot) return '';
  
  // Extract start time from "10:00 - 11:30" format
  const match = timeSlot.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : timeSlot;
}

/**
 * Sort time slots chronologically for advanced layout
 * @param {Array} timeSlots - Array of time slot strings
 * @returns {Array} Sorted time slot strings  
 */
function sortTimeSlots(timeSlots) {
  return timeSlots.sort((a, b) => {
    const parseTime = (timeStr) => {
      const startTime = extractStartTime(timeStr);
      const match = startTime.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        return parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      return 0;
    };
    
    return parseTime(a) - parseTime(b);
  });
}