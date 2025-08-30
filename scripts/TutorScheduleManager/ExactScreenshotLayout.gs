/**
 * EXACT SCREENSHOT LAYOUT SYSTEM
 * 
 * Creates the precise layout that matches the tutor schedule screenshot
 * This includes proper column structure with status boxes to the right of student names
 */

// ============================================================================
// EXACT SCREENSHOT LAYOUT ENGINE
// ============================================================================

/**
 * Create the exact layout that matches the screenshot
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Object} scheduleData - Processed schedule data
 */
function createExactScreenshotLayout(sheet, scheduleData) {
  Logger.log('Creating exact screenshot layout...');
  
  // Clear existing content (preserve headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(3, 1, lastRow - 2, sheet.getMaxColumns()).clear();
  }
  
  // Setup the column structure first
  setupScreenshotColumnStructure(sheet);
  
  // Create the headers with proper structure
  createScreenshotHeaders(sheet, scheduleData.weekStart);
  
  // Get sorted time slots
  const sortedTimeSlots = sortTimeSlots(Object.keys(scheduleData.timeSlots || {}));
  Logger.log(`Processing ${sortedTimeSlots.length} time slots`);
  
  if (sortedTimeSlots.length === 0) {
    Logger.log('No time slots found - creating empty schedule message');
    sheet.getRange(3, 1, 1, 1).setValue('No sessions scheduled for this week');
    return;
  }
  
  let currentRow = 3;
  
  for (const timeSlot of sortedTimeSlots) {
    const slotData = scheduleData.timeSlots[timeSlot];
    
    // Create the time slot section
    currentRow = createScreenshotTimeSlotSection(sheet, currentRow, timeSlot, slotData);
  }
  
  // Apply final formatting
  applyScreenshotFormatting(sheet);
  
  Logger.log(`Exact screenshot layout created with ${sortedTimeSlots.length} time slots`);
}

/**
 * Setup the column structure to match screenshot (each day has 3 sub-columns)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function setupScreenshotColumnStructure(sheet) {
  // Column structure: Time | Sun(Name|L|A) | Mon(Name|L|A) | ... | Sat(Name|L|A)
  // Total columns: 1 + (7 days × 3 sub-columns) = 22 columns
  
  // Set column widths
  sheet.setColumnWidth(1, 80);  // Time column (wider for vertical text)
  
  // For each day: Name column (wide), Status1 (narrow), Status2 (narrow)
  for (let day = 0; day < 7; day++) {
    const baseCol = 2 + (day * 3);
    sheet.setColumnWidth(baseCol, 200);     // Student name column (even wider for 9px text)
    sheet.setColumnWidth(baseCol + 1, 25);  // Lesson status column
    sheet.setColumnWidth(baseCol + 2, 25);  // Attendance status column
  }
}

/**
 * Create headers that match the screenshot structure
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Date} weekStart - Sunday of the week
 */
function createScreenshotHeaders(sheet, weekStart) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Row 1: Day names (merged across 3 sub-columns each)
  const dayHeaderRow = [''];
  const dateHeaderRow = [''];
  
  for (let day = 0; day < 7; day++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + day);
    
    // Add day name to span 3 columns
    dayHeaderRow.push(days[day], '', '');
    
    // Add date to span 3 columns  
    const dateStr = formatDateForHeader(date);
    dateHeaderRow.push(dateStr, '', '');
  }
  
  // Set the header data
  sheet.getRange(1, 1, 1, 22).setValues([dayHeaderRow]);
  sheet.getRange(2, 1, 1, 22).setValues([dateHeaderRow]);
  
  // Merge cells for day names and dates
  for (let day = 0; day < 7; day++) {
    const baseCol = 2 + (day * 3);
    
    // Merge day name across 3 columns
    if (dayHeaderRow[baseCol]) {
      sheet.getRange(1, baseCol, 1, 3).merge();
    }
    
    // Merge date across 3 columns
    if (dateHeaderRow[baseCol]) {
      sheet.getRange(2, baseCol, 1, 3).merge();
    }
  }
  
  // Format headers
  const headerRange = sheet.getRange(1, 1, 2, 22);
  headerRange.setBackground('#E8F0FE');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setBorder(true, true, true, true, true, true);
}

/**
 * Create a time slot section that matches the screenshot
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {string} timeSlot - Time slot string (e.g., "10:00 - 11:30")
 * @param {Object} slotData - Time slot data
 * @returns {number} Next available row
 */
function createScreenshotTimeSlotSection(sheet, startRow, timeSlot, slotData) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // Find max students for this time slot
  const maxStudents = Math.max(...days.map(day => slotData.days[day].students.length), 0);
  const studentRows = Math.max(maxStudents, 3); // Minimum 3 rows per time slot
  
  // Create class grade header row
  createClassGradeHeaderRow(sheet, startRow, timeSlot, slotData, days);
  
  // Create student rows
  for (let studentIndex = 0; studentIndex < studentRows; studentIndex++) {
    const rowNum = startRow + 1 + studentIndex;
    createStudentDataRow(sheet, rowNum, slotData, studentIndex, days, studentIndex === 0);
  }
  
  // Merge time slot cell vertically across all rows in this section
  const sectionHeight = 1 + studentRows;
  if (sectionHeight > 1) {
    sheet.getRange(startRow, 1, sectionHeight, 1).merge();
  }
  
  // Add borders around the time slot section
  addTimeSlotBorders(sheet, startRow, sectionHeight);
  
  return startRow + sectionHeight + 1; // +1 for spacing
}

/**
 * Create class grade header row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {string} timeSlot - Time slot string
 * @param {Object} slotData - Time slot data
 * @param {Array} days - Day names array
 */
function createClassGradeHeaderRow(sheet, row, timeSlot, slotData, days) {
  // Format time slot for vertical display with line breaks
  const formattedTimeSlot = formatTimeSlotVertical(timeSlot);
  
  // Create the header row data
  const headerRowData = [formattedTimeSlot]; // Formatted time slot in first column
  
  for (const dayName of days) {
    const dayData = slotData.days[dayName];
    const classGrade = dayData.classGrade || '';
    
    // Add class grade spanning 3 sub-columns
    headerRowData.push(classGrade, '', '');
  }
  
  // Set the data
  sheet.getRange(row, 1, 1, 22).setValues([headerRowData]);
  
  // Merge class grade cells across 3 sub-columns
  for (let day = 0; day < 7; day++) {
    const baseCol = 2 + (day * 3);
    const dayData = slotData.days[days[day]];
    
    if (dayData.classGrade) {
      sheet.getRange(row, baseCol, 1, 3).merge();
      
      // Apply class grade color coding
      const gradeCell = sheet.getRange(row, baseCol, 1, 3);
      gradeCell.setBackground(getClassGradeColor(dayData.classGrade));
      gradeCell.setFontWeight('bold');
      gradeCell.setHorizontalAlignment('center');
    }
  }
  
  // Format time column (remove rotation, use horizontal text with line breaks)
  const timeCell = sheet.getRange(row, 1);
  timeCell.setBackground('#F8F9FA');
  timeCell.setFontWeight('bold');
  timeCell.setHorizontalAlignment('center');
  timeCell.setVerticalAlignment('middle');
  timeCell.setWrap(true); // Allow line breaks
  // Remove text rotation for horizontal multi-line display
}

/**
 * Create student data row with proper three-column structure
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {Object} slotData - Time slot data
 * @param {number} studentIndex - Student index
 * @param {Array} days - Day names array
 * @param {boolean} isFirstStudentRow - Whether this is the first student row
 */
function createStudentDataRow(sheet, row, slotData, studentIndex, days, isFirstStudentRow) {
  const rowData = ['']; // Empty time column for student rows
  
  // For each day, add student name and two status indicators
  for (const dayName of days) {
    const dayData = slotData.days[dayName];
    
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      
      // Column 1: Student info (with school)
      const studentInfo = formatStudentWithSchool(student);
      
      // Column 2: Lesson status (R, M, S, T, ?, or blank)
      const lessonStatus = getLessonStatusIndicator(student.session_status) || '';
      
      // Column 3: Attendance status (✓, X, or blank)
      const attendanceStatus = getAttendanceStatusIndicator(student.session_status, student.attendance_marked_by) || '';
      
      rowData.push(studentInfo, lessonStatus, attendanceStatus);
      
    } else {
      // Empty cells for this day
      rowData.push('', '', '');
    }
  }
  
  // Set the data
  sheet.getRange(row, 1, 1, 22).setValues([rowData]);
  
  // Apply formatting to each student cell
  for (let day = 0; day < 7; day++) {
    const dayData = slotData.days[days[day]];
    
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      const baseCol = 2 + (day * 3);
      
      // Format student name cell
      const studentCell = sheet.getRange(row, baseCol);
      applyStudentCellFormatting(studentCell, student);
      
      // Format status cells
      const lessonStatusCell = sheet.getRange(row, baseCol + 1);
      const attendanceCell = sheet.getRange(row, baseCol + 2);
      
      applyStatusCellFormatting(lessonStatusCell, attendanceCell, student);
    }
  }
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format student info with school included
 * @param {Object} student - Student session object
 * @returns {string} Formatted string with school
 */
function formatStudentWithSchool(student) {
  const parts = [];
  
  if (student.school_student_id) parts.push(student.school_student_id);
  if (student.student_name) parts.push(student.student_name);
  if (student.grade && student.lang_stream) parts.push(`${student.grade}${student.lang_stream}`);
  if (student.school) parts.push(student.school); // Include school
  
  return parts.join(' ');
}

/**
 * Get class grade color coding
 * @param {string} classGrade - Class grade (e.g., "F1 E", "F2 C")
 * @returns {string} Hex color code
 */
function getClassGradeColor(classGrade) {
  if (!classGrade) return '#FFFFFF';
  
  const grade = classGrade.split(' ')[0]; // Get F1, F2, F3, etc.
  
  // Customize these colors as needed
  const gradeColors = {
    'F1': '#D4E6F1', // Light green  
    'F2': '#D6EAF8', // Light blue
    'F3': '#FCF3CF', // Light yellow
    'F4': '#FADBD8', // Light pink
    'F5': '#E8DAEF', // Light purple
    'F6': '#D5F4E6'  // Light mint
  };
  
  return gradeColors[grade] || '#F8F9FA'; // Default light gray
}

/**
 * Apply formatting to student name cell
 * @param {GoogleAppsScript.Spreadsheet.Range} cell - Student name cell
 * @param {Object} student - Student session object
 */
function applyStudentCellFormatting(cell, student) {
  const sessionStatus = student.session_status || '';
  
  // Apply strikethrough for rescheduled/no show
  if (shouldStrikethrough(sessionStatus)) {
    cell.setFontLine('line-through');
    cell.setFontColor('#999999'); // Gray text
  }
  
  // Background color for unpaid sessions
  if (student.financial_status === 'Unpaid') {
    cell.setBackground('#FFF3E0'); // Very light orange
  }
  
  cell.setFontSize(9);  // Back to 9px as requested
  cell.setVerticalAlignment('middle');
  cell.setWrap(true);  // Allow text wrapping for long names
}

/**
 * Apply formatting to status indicator cells
 * @param {GoogleAppsScript.Spreadsheet.Range} lessonCell - Lesson status cell
 * @param {GoogleAppsScript.Spreadsheet.Range} attendanceCell - Attendance status cell
 * @param {Object} student - Student session object
 */
function applyStatusCellFormatting(lessonCell, attendanceCell, student) {
  const lessonStatus = getLessonStatusIndicator(student.session_status) || '';
  
  // Format both cells
  [lessonCell, attendanceCell].forEach(cell => {
    cell.setFontSize(8);
    cell.setFontWeight('bold');
    cell.setHorizontalAlignment('center');
    cell.setVerticalAlignment('middle');
  });
  
  // Color code lesson status cell
  if (lessonStatus === 'R') {
    lessonCell.setBackground('#FFE6CC'); // Light orange for rescheduled
  } else if (lessonStatus === 'M') {
    lessonCell.setBackground('#FFF2CC'); // Light yellow for make-up
  } else if (lessonStatus === 'S') {
    lessonCell.setBackground('#F4CCCC'); // Light red for sick
  } else if (lessonStatus === 'T') {
    lessonCell.setBackground('#D0E0E3'); // Light blue for trial
  } else if (lessonStatus === '?') {
    lessonCell.setBackground('#D9D9D9'); // Light gray for TBC
  }
  
  // Attendance cell gets standard background
  const attendanceStatus = getAttendanceStatusIndicator(student.session_status, student.attendance_marked_by) || '';
  if (attendanceStatus === '✓') {
    attendanceCell.setBackground('#D4F6D4'); // Light green for attended
  } else if (attendanceStatus === 'X') {
    attendanceCell.setBackground('#FFD4D4'); // Light red for no show
  }
}

/**
 * Add borders around time slot section
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {number} height - Section height
 */
function addTimeSlotBorders(sheet, startRow, height) {
  const sectionRange = sheet.getRange(startRow, 1, height, 22);
  sectionRange.setBorder(true, true, true, true, true, true, '#666666', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Apply final formatting to the sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function applyScreenshotFormatting(sheet) {
  // Set overall sheet properties
  sheet.setFrozenRows(2); // Freeze header rows
  sheet.setFrozenColumns(1); // Freeze time column
  
  // Set default font
  const dataRange = sheet.getDataRange();
  if (dataRange.getNumRows() > 0) {
    dataRange.setFontFamily('Arial');
  }
}

// ============================================================================
// HELPER FUNCTIONS (copied from other files for this layout)
// ============================================================================

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
  if (status.includes('to be confirmed') || status.includes('confirm')) return '?';
  
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
 * Format time slot for vertical display with line breaks
 * @param {string} timeSlot - Time slot like "10:00 - 11:30"
 * @returns {string} Formatted time slot like "10:00\n-\n11:30"
 */
function formatTimeSlotVertical(timeSlot) {
  if (!timeSlot) return '';
  
  // Extract start and end times from "10:00 - 11:30" format
  const match = timeSlot.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  
  if (match) {
    const [, startTime, endTime] = match;
    return `${startTime}\n-\n${endTime}`;
  }
  
  // If no match, return original
  return timeSlot;
}

/**
 * Sort time slots chronologically
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