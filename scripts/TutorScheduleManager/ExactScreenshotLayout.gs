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
 * @param {string} tutorName - Tutor's name for header
 */
function createExactScreenshotLayout(sheet, scheduleData, tutorName = 'Tutor Name', weekStart = null, rdoDays = [], holidays = []) {
  Logger.log('Creating exact screenshot layout...');
  
  // FIRST: Remove any existing frozen rows/columns to prevent merge conflicts
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);
  
  // Clear ALL existing content and formatting to avoid merge conflicts
  sheet.clear();
  
  // Detect special days for dynamic column width
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const specialDays = weekStart ? detectSpecialDays(scheduleData, rdoDays, holidays, weekStart, days) : { rdo: [], holidays: [], empty: [] };
  Logger.log(`Special days detected:`, specialDays);
  
  // Setup the column structure first with special day info
  setupScreenshotColumnStructure(sheet, specialDays);
  
  // Create the headers with proper structure (4 rows now)  
  createScreenshotHeaders(sheet, weekStart || scheduleData.weekStart, tutorName, specialDays, holidays);
  
  // Get sorted time slots
  const sortedTimeSlots = sortTimeSlots(Object.keys(scheduleData.timeSlots || {}));
  Logger.log(`Processing ${sortedTimeSlots.length} time slots`);
  
  if (sortedTimeSlots.length === 0) {
    Logger.log('No time slots found - creating empty schedule message');
    sheet.getRange(5, 1, 1, 1).setValue('No sessions scheduled for this week');
    return;
  }
  
  let currentRow = 5; // Start after 4 header rows
  
  for (const timeSlot of sortedTimeSlots) {
    const slotData = scheduleData.timeSlots[timeSlot];
    
    // Add medium grey spacer row between time slots
    if (currentRow > 5) {
      addTimeSlotSpacerRow(sheet, currentRow);
      currentRow++;
    }
    
    // Create the time slot section
    currentRow = createScreenshotTimeSlotSection(sheet, currentRow, timeSlot, slotData, scheduleData, specialDays);
  }
  
  // Apply final formatting
  applyScreenshotFormatting(sheet);
  
  Logger.log(`Exact screenshot layout created with ${sortedTimeSlots.length} time slots`);
}

/**
 * Setup the column structure to match screenshot (each day has 3 sub-columns)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function setupScreenshotColumnStructure(sheet, specialDays = { rdo: [], holidays: [], empty: [] }) {
  // Column structure: Time | Sun(Name|L|A) | Mon(Name|L|A) | ... | Sat(Name|L|A)
  // Total columns: 1 + (7 days × 3 sub-columns) = 22 columns
  
  // Batch set column widths for better performance
  const columnWidths = [45]; // Time column
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // Build array of column widths for batch operation with dynamic sizing
  for (let day = 0; day < 7; day++) {
    const dayName = dayNames[day];
    
    if (specialDays.rdo.includes(dayName) || specialDays.holidays.includes(dayName)) {
      // Narrow width for RDO and holidays
      columnWidths.push(60);  // Narrow student name column
      columnWidths.push(12);  // Narrow lesson status column  
      columnWidths.push(12);  // Narrow attendance status column
    } else {
      // Normal width for regular days
      columnWidths.push(200); // Student name column
      columnWidths.push(16);  // Lesson status column  
      columnWidths.push(16);  // Attendance status column
    }
  }
  
  // Set all column widths in batch operations (Google Apps Script optimization)
  for (let i = 0; i < columnWidths.length; i++) {
    sheet.setColumnWidth(i + 1, columnWidths[i]);
  }
}

/**
 * Create headers that match the screenshot structure
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {Date} weekStart - Sunday of the week
 * @param {string} tutorName - Tutor's name for header
 */
function createScreenshotHeaders(sheet, weekStart, tutorName = 'Tutor Name') {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Row 1: "Class Schedule" title starting from column B, with year in last 2 columns
  const titleRow = ['', 'Class Schedule', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', weekStart.getFullYear().toString(), ''];
  sheet.getRange(1, 1, 1, 22).setValues([titleRow]);
  
  // Row 2: Tutor name starting from column B (no extra "Mr" prefix)
  const tutorRow = ['', tutorName, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  sheet.getRange(2, 1, 1, 22).setValues([tutorRow]);
  
  // Row 3: Dates (Sep 03 format) - skip status columns for cleaner borders
  const dateHeaderRow = [''];
  for (let day = 0; day < 7; day++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + day);
    
    // Add date spanning only the name column, skip status columns
    const dateStr = formatDateForScreenshot(date);
    const baseCol = 2 + (day * 3);
    dateHeaderRow.push(dateStr, '', '');
  }
  sheet.getRange(3, 1, 1, 22).setValues([dateHeaderRow]);
  
  // Row 4: Day names - skip status columns for cleaner borders
  const dayHeaderRow = [''];
  for (let day = 0; day < 7; day++) {
    // Add day name spanning only the name column, skip status columns
    dayHeaderRow.push(days[day], '', '');
  }
  sheet.getRange(4, 1, 1, 22).setValues([dayHeaderRow]);
  
  // Merge cells for dates and day names (only name columns, not status columns)
  for (let day = 0; day < 7; day++) {
    const baseCol = 2 + (day * 3);
    
    // Merge date across only the name column (not status columns)
    sheet.getRange(3, baseCol, 1, 1); // Single column, no merge needed
    
    // Merge day name across only the name column (not status columns)
    sheet.getRange(4, baseCol, 1, 1); // Single column, no merge needed
  }
  
  // Apply screenshot-specific formatting (this includes merging)
  formatScreenshotHeaders(sheet, tutorName, weekStart);
}

/**
 * Create a time slot section that matches the screenshot
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {string} timeSlot - Time slot string (e.g., "10:00 - 11:30")
 * @param {Object} slotData - Time slot data
 * @param {Object} scheduleData - Complete schedule data for overlap detection
 * @param {Object} specialDays - Object with RDO and holiday day info
 * @returns {number} Next available row
 */
function createScreenshotTimeSlotSection(sheet, startRow, timeSlot, slotData, scheduleData, specialDays = {}) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // Find max students for this time slot
  const maxStudents = Math.max(...days.map(day => slotData.days[day].students.length), 0);
  const studentRows = Math.max(maxStudents, 3); // Minimum 3 rows per time slot
  
  // Create class grade header row with color coding and overlap detection
  createClassGradeHeaderRow(sheet, startRow, timeSlot, slotData, days, scheduleData, specialDays);
  
  // Create student rows
  for (let studentIndex = 0; studentIndex < studentRows; studentIndex++) {
    const rowNum = startRow + 1 + studentIndex;
    createStudentDataRow(sheet, rowNum, slotData, studentIndex, days, studentIndex === 0, specialDays);
  }
  
  // Merge time slot cell vertically across all rows in this section
  const sectionHeight = 1 + studentRows;
  if (sectionHeight > 1) {
    sheet.getRange(startRow, 1, sectionHeight, 1).merge();
  }
  
  // Add borders around the time slot section
  addTimeSlotBorders(sheet, startRow, sectionHeight);
  
  // Remove borders between L and A columns to create "L A" format
  removeStatusColumnBorders(sheet, startRow, sectionHeight);
  
  return startRow + sectionHeight; // No extra spacing - grey spacer handles spacing
}

/**
 * Create class grade header row with time slot color coding
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {string} timeSlot - Time slot string
 * @param {Object} slotData - Time slot data
 * @param {Array} days - Day names array
 * @param {Object} scheduleData - Complete schedule data for overlap detection
 * @param {Object} specialDays - Object with RDO and holiday day info
 */
function createClassGradeHeaderRow(sheet, row, timeSlot, slotData, days, scheduleData, specialDays = {}) {
  // Check for same-day overlaps and format time slot accordingly
  let formattedTimeSlot = formatTimeSlotVertical(timeSlot);
  
  // Check if any day has overlaps and add warning indicators
  const daysWithOverlaps = [];
  for (const dayName of days) {
    if (slotData.days[dayName].students.length > 0) {
      if (detectSameDayOverlap(scheduleData, timeSlot, dayName)) {
        daysWithOverlaps.push(dayName);
      }
    }
  }
  
  // Add warning indicator if overlaps detected
  if (daysWithOverlaps.length > 0) {
    formattedTimeSlot = '⚠️ ' + formattedTimeSlot;
  }
  
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
    const dayName = days[day];
    
    // Always merge the 3 sub-columns for this day
    sheet.getRange(row, baseCol, 1, 3).merge();
    const gradeCell = sheet.getRange(row, baseCol, 1, 3);
    
    // Check if this day is RDO or holiday
    const isRDO = specialDays.rdo && specialDays.rdo.includes(dayName);
    const isHoliday = specialDays.holidays && specialDays.holidays.includes(dayName);
    
    if (isRDO || isHoliday) {
      // Apply RDO/holiday greying (overrides class grade color)
      gradeCell.setBackground('#b0b0b0'); // Same grey for both RDO and holidays
    } else if (dayData.classGrade) {
      // Apply normal class grade color coding
      gradeCell.setBackground(getClassGradeColor(dayData.classGrade));
    }
    
    // Apply common formatting
    gradeCell.setFontWeight('bold');
    gradeCell.setHorizontalAlignment('center');
    gradeCell.setVerticalAlignment('middle');
  }
  
  // Format time column with category-based color coding
  const timeCell = sheet.getRange(row, 1);
  const timeSlotCategory = categorizeTimeSlot(timeSlot);
  const timeSlotBgColor = getTimeSlotBackgroundColor(timeSlotCategory);
  const timeSlotTextColor = getTimeSlotTextColor(timeSlotCategory);
  
  timeCell.setBackground(timeSlotBgColor);
  timeCell.setFontColor(timeSlotTextColor);
  timeCell.setFontWeight('bold');
  timeCell.setFontSize(9); // 9pt font for time slot text
  timeCell.setHorizontalAlignment('center');
  timeCell.setVerticalAlignment('middle');
  timeCell.setWrap(true); // Allow line breaks
}

/**
 * Create student data row with proper three-column structure
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {Object} slotData - Time slot data
 * @param {number} studentIndex - Student index
 * @param {Array} days - Day names array
 * @param {boolean} isFirstStudentRow - Whether this is the first student row
 * @param {Object} specialDays - Object with RDO and holiday day info
 */
function createStudentDataRow(sheet, row, slotData, studentIndex, days, isFirstStudentRow, specialDays = {}) {
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
    const dayName = days[day];
    const baseCol = 2 + (day * 3);
    
    // Get cells for this day
    const studentCell = sheet.getRange(row, baseCol);
    const lessonStatusCell = sheet.getRange(row, baseCol + 1);
    const attendanceCell = sheet.getRange(row, baseCol + 2);
    
    // Apply RDO/holiday styling if applicable
    const isRDO = specialDays.rdo && specialDays.rdo.includes(dayName);
    const isHoliday = specialDays.holidays && specialDays.holidays.includes(dayName);
    
    if (isRDO || isHoliday) {
      // Grey out RDO/holiday cells regardless of student presence
      const greyColor = '#b0b0b0'; // Same grey for both RDO and holidays
      studentCell.setBackground(greyColor);
      lessonStatusCell.setBackground(greyColor);
      attendanceCell.setBackground(greyColor);
    }
    
    if (dayData.students[studentIndex]) {
      const student = dayData.students[studentIndex];
      
      // Format student name cell with rich text (but preserve RDO/holiday background)
      if (!isRDO && !isHoliday) {
        applyStudentCellFormatting(studentCell, student);
      }
      formatStudentCellRichText(studentCell, student);
      
      // Format status cells (but preserve RDO/holiday background)
      if (!isRDO && !isHoliday) {
        applyStatusCellFormatting(lessonStatusCell, attendanceCell, student);
      } else {
        // Apply minimal formatting for status cells on special days
        [lessonStatusCell, attendanceCell].forEach(cell => {
          cell.setHorizontalAlignment('center');
          cell.setVerticalAlignment('middle');
          cell.setFontSize(8);
        });
      }
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
  
  // Parse grade and stream (e.g., "F1 E" -> grade="F1", stream="E")
  const parts = classGrade.split(' ');
  const grade = parts[0]; // F1, F2, F3, F4
  const stream = parts[1]; // C, E
  
  if (!grade || !stream) return '#F8F9FA'; // Default light gray
  
  // Specific colors for each grade-stream combination
  const gradeStreamColors = {
    'F1 C': '#B7E1CD',
    'F1 E': '#CEDAF5',
    'F2 C': '#FBF2D0',
    'F2 E': '#EBCECD',
    'F3 C': '#E4D2DC',
    'F3 E': '#E7B477',
    'F4 C': '#9FC185',
    'F4 E': '#D8D3E7'
  };
  
  return gradeStreamColors[classGrade] || '#F8F9FA'; // Default light gray
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
  
  // Note: Red text for unpaid sessions is handled in formatStudentCellRichText()
  
  cell.setFontSize(9);
  cell.setVerticalAlignment('middle');
  cell.setWrap(true);
  cell.setFontFamily('Roboto');
  
  // Apply borders - keep right border (separates student from status columns)
  cell.setBorder(true, true, true, true, true, true, '#666666', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Apply rich text formatting to student cell with right-aligned details
 * @param {GoogleAppsScript.Spreadsheet.Range} cell - Student name cell
 * @param {Object} student - Student session object
 */
function formatStudentCellRichText(cell, student) {
  // Determine if text should be red for unpaid sessions
  const isUnpaid = student.financial_status === 'Unpaid';
  const leftTextColor = isUnpaid ? '#FF0000' : '#000000';  // Red for unpaid, black otherwise
  
  // Build left part (ID and name) - no longer bold
  let leftPart = '';
  if (student.school_student_id) {
    leftPart += student.school_student_id;
  }
  if (student.student_name) {
    if (leftPart.length > 0) leftPart += ' ';
    leftPart += student.student_name;
  }
  
  // Build right part (grade/stream and school) - italic grey
  let rightPart = '';
  if (student.grade && student.lang_stream) {
    rightPart += `${student.grade}${student.lang_stream}`;
  }
  if (student.school) {
    if (rightPart.length > 0) rightPart += ' ';
    rightPart += student.school;
  }
  
  // Calculate spacing to push right part to the right
  // Approximate cell width in characters (name column is 200px wide, ~35-40 chars with 9px font)
  const approximateCellWidth = 32;  // Increased to push text more to the right
  const leftLength = leftPart.length;
  const rightLength = rightPart.length;
  const totalUsed = leftLength + rightLength;
  
  // Add spaces to push right content to the right (leave 1 space minimum)
  let spacer = '';
  if (totalUsed < approximateCellWidth) {
    const spacesNeeded = Math.max(1, approximateCellWidth - totalUsed);
    spacer = ' '.repeat(spacesNeeded);
  } else {
    spacer = ' '; // At least one space
  }
  
  // Combine all parts
  const fullText = leftPart + spacer + rightPart;
  
  // Build rich text with formatting
  let builder = SpreadsheetApp.newRichTextValue()
    .setText(fullText);
  
  // Apply formatting
  if (leftPart.length > 0) {
    // Left part - use dynamic color (red for unpaid, black otherwise)
    const leftStyle = SpreadsheetApp.newTextStyle()
      .setForegroundColor(leftTextColor)
      .setFontFamily('Roboto')
      .setFontSize(9)
      .build();
    builder = builder.setTextStyle(0, leftPart.length, leftStyle);
  }
  
  if (rightPart.length > 0) {
    // Right part - italic grey text
    const rightStartIndex = leftPart.length + spacer.length;
    const rightStyle = SpreadsheetApp.newTextStyle()
      .setForegroundColor('#666666')
      .setFontFamily('Roboto')
      .setFontSize(9)
      .setItalic(true)
      .build();
    builder = builder.setTextStyle(rightStartIndex, fullText.length, rightStyle);
  }
  
  cell.setRichTextValue(builder.build());
}

/**
 * Apply formatting to status indicator cells
 * @param {GoogleAppsScript.Spreadsheet.Range} lessonCell - Lesson status cell
 * @param {GoogleAppsScript.Spreadsheet.Range} attendanceCell - Attendance status cell
 * @param {Object} student - Student session object
 */
function applyStatusCellFormatting(lessonCell, attendanceCell, student) {
  const lessonStatus = getLessonStatusIndicator(student.session_status) || '';
  const attendanceStatus = getAttendanceStatusIndicator(student.session_status, student.attendance_marked_by) || '';
  
  // Batch format both cells with common properties using range
  const statusRange = lessonCell.getSheet().getRange(
    lessonCell.getRow(), lessonCell.getColumn(), 1, 2
  );
  statusRange.setFontSize(9);
  statusRange.setFontWeight('bold'); 
  statusRange.setHorizontalAlignment('center');
  statusRange.setVerticalAlignment('middle');
  
  // Apply borders - no border between lesson and attendance columns (L A format, not L|A)
  // Lesson cell: top, left, bottom borders but no right border
  lessonCell.setBorder(true, true, true, false, false, false, '#666666', SpreadsheetApp.BorderStyle.SOLID);
  // Attendance cell: top, bottom, right borders but no left border
  attendanceCell.setBorder(true, false, true, true, false, false, '#666666', SpreadsheetApp.BorderStyle.SOLID);
  
  // Batch background color operations using helper functions
  const lessonBgColor = getLessonStatusBackgroundColor(lessonStatus);
  const attendanceBgColor = getAttendanceStatusBackgroundColor(attendanceStatus);
  
  if (lessonBgColor) lessonCell.setBackground(lessonBgColor);
  if (attendanceBgColor) attendanceCell.setBackground(attendanceBgColor);
}

/**
 * Get background color for lesson status (centralized for performance)
 * @param {string} lessonStatus - Status indicator
 * @returns {string|null} Background color or null
 */
function getLessonStatusBackgroundColor(lessonStatus) {
  const colorMap = {
    'R': '#F4CCCC', // Light red for rescheduled (same as sick)
    'M': '#FFF2CC', // Light yellow for make-up
    'S': '#F4CCCC', // Light red for sick
    'T': '#D0E0E3', // Light blue for trial
    '?': '#D9D9D9'  // Light gray for TBC
  };
  return colorMap[lessonStatus] || null;
}

/**
 * Get background color for attendance status (centralized for performance)
 * @param {string} attendanceStatus - Attendance indicator
 * @returns {string|null} Background color or null
 */
function getAttendanceStatusBackgroundColor(attendanceStatus) {
  const colorMap = {
    '✓': '#D4F6D4', // Light green for attended
    'X': '#FFD4D4'  // Light red for no show
  };
  return colorMap[attendanceStatus] || null;
}

/**
 * Add borders around time slot section
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {number} height - Section height
 */
function addTimeSlotBorders(sheet, startRow, height) {
  // Add all borders initially - we'll remove specific ones later
  const sectionRange = sheet.getRange(startRow, 1, height, 22);
  sectionRange.setBorder(true, true, true, true, true, true, '#666666', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Remove borders between lesson and attendance status columns to create "L A" format
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} startRow - Starting row
 * @param {number} height - Section height
 */
function removeStatusColumnBorders(sheet, startRow, height) {
  for (let row = startRow; row < startRow + height; row++) {
    for (let day = 0; day < 7; day++) {
      const lessonCol = 2 + (day * 3) + 1;      // Lesson status column (L)
      const attendanceCol = 2 + (day * 3) + 2;  // Attendance status column (A)
      
      // Remove right border from lesson column (removes border between L and A)
      const lessonCell = sheet.getRange(row, lessonCol);
      lessonCell.setBorder(null, null, null, false, null, null, null, null);
      
      // Remove left border from attendance column (removes border between L and A)  
      const attendanceCell = sheet.getRange(row, attendanceCol);
      attendanceCell.setBorder(null, false, null, null, null, null, null, null);
    }
  }
}

/**
 * Apply final formatting to the sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function applyScreenshotFormatting(sheet) {
  // Set default font to Roboto for everything
  const dataRange = sheet.getDataRange();
  if (dataRange.getNumRows() > 0) {
    dataRange.setFontFamily('Roboto');
  }
  
  // Set all main content rows to 25px height
  for (let row = 5; row <= sheet.getLastRow(); row++) {
    sheet.setRowHeight(row, 25);
  }
  
  // Now we can safely freeze column A and row 4 (headers start from column B)
  sheet.setFrozenRows(4); // Freeze all 4 header rows
  sheet.setFrozenColumns(1); // Freeze column A (time column)
}

/**
 * Add medium grey spacer row between time slots
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number for spacer
 */
function addTimeSlotSpacerRow(sheet, row) {
  // Create empty row
  const spacerRow = new Array(22).fill('');
  sheet.getRange(row, 1, 1, 22).setValues([spacerRow]);
  
  // Apply medium grey background with custom spacer borders
  formatSpacerRowBorders(sheet, row, '#B0B0B0', '#000000');
  
  // Set spacer row height to 25px like other main content rows
  sheet.setRowHeight(row, 25);
}

/**
 * Format header/spacer row without borders on status columns
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {string} backgroundColor - Background color
 * @param {string} fontColor - Font color
 */
function formatHeaderRowWithoutStatusBorders(sheet, row, backgroundColor, fontColor) {
  // Format entire row with background and font
  const fullRange = sheet.getRange(row, 1, 1, 22);
  fullRange.setBackground(backgroundColor);
  fullRange.setFontColor(fontColor);
  fullRange.setFontWeight('bold');
  fullRange.setFontFamily('Roboto');
  fullRange.setHorizontalAlignment('center');
  fullRange.setVerticalAlignment('middle');
  
  // Apply borders to each day's columns with specific rules
  for (let day = 0; day < 7; day++) {
    const nameCol = 2 + (day * 3);
    const status1Col = nameCol + 1;
    const status2Col = nameCol + 2;
    
    // Name column - no right border (don't separate from 1st status column)
    const nameCell = sheet.getRange(row, nameCol);
    nameCell.setBorder(true, true, true, false, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    
    // First status column - no left border (connected to name), no right border (no separation from 2nd status)
    const status1Cell = sheet.getRange(row, status1Col);
    status1Cell.setBorder(true, false, true, false, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    
    // Second status column - no left border (connected to 1st status), has right border
    const status2Cell = sheet.getRange(row, status2Col);
    status2Cell.setBorder(true, false, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  }
  
  // Border for time column (column A)
  const timeCell = sheet.getRange(row, 1);
  timeCell.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  // Clear formatting for A3 and A4 (time column in date/day rows should be white and borderless)
  if (row === 3 || row === 4) {
    const timeCellInHeader = sheet.getRange(row, 1);
    timeCellInHeader.setBackground('#FFFFFF');
    timeCellInHeader.setBorder(false, false, false, false, false, false);
  }
  
  // Right border for column V (column 22)
  const rightCell = sheet.getRange(row, 22);
  rightCell.setBorder(true, false, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Format title row borders (no bottom border from A1 to T1, no vertical between A1-A2 and B1-B2)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function formatTitleRowBorders(sheet) {
  // Column A - top, left, right borders, but no bottom border
  const colA = sheet.getRange(1, 1);
  colA.setBorder(true, true, false, true, false, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  // Columns B to T - top, right borders, no bottom, no left (for B only to remove A1-B1 border)
  for (let col = 2; col <= 20; col++) {
    const cell = sheet.getRange(1, col);
    if (col === 2) {
      // Column B - no left border (removes A1-B1 vertical border)
      cell.setBorder(true, false, false, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    } else {
      // Other columns - normal borders but no bottom
      cell.setBorder(true, true, false, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    }
  }
  
  // Columns U and V (year) - all borders
  const yearRange = sheet.getRange(1, 21, 1, 2);
  yearRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Format tutor row borders (no top border for row 2, no vertical between A2-B2)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function formatTutorRowBorders(sheet) {
  // Column A - left, bottom, right borders, no top (removes row 1-2 border)
  const colA = sheet.getRange(2, 1);
  colA.setBorder(false, true, true, true, false, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  // Column B - bottom, right borders, no top, no left (removes A2-B2 border)
  const colB = sheet.getRange(2, 2);
  colB.setBorder(false, false, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  // Columns C to T - bottom, left, right borders, no top
  for (let col = 3; col <= 20; col++) {
    const cell = sheet.getRange(2, col);
    cell.setBorder(false, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  }
  
  // Note: Columns U and V are part of the merged year cell (U1:V2), no separate border needed
}

/**
 * Format spacer row borders with special requirements
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} row - Row number
 * @param {string} backgroundColor - Background color
 * @param {string} fontColor - Font color
 */
function formatSpacerRowBorders(sheet, row, backgroundColor, fontColor) {
  // Format entire row with background and font
  const fullRange = sheet.getRange(row, 1, 1, 22);
  fullRange.setBackground(backgroundColor);
  fullRange.setFontColor(fontColor);
  fullRange.setFontWeight('bold');
  fullRange.setFontFamily('Roboto');
  fullRange.setHorizontalAlignment('center');
  fullRange.setVerticalAlignment('middle');
  
  // Time column (A) - all borders
  const timeCell = sheet.getRange(row, 1);
  timeCell.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  // For each day: name column + status columns with no internal borders
  for (let day = 0; day < 7; day++) {
    const nameCol = 2 + (day * 3);
    const status1Col = nameCol + 1;
    const status2Col = nameCol + 2;
    
    // Name column - no right border (connected to status columns)
    const nameCell = sheet.getRange(row, nameCol);
    nameCell.setBorder(true, true, true, false, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    
    // First status column - no left border, no right border (no internal borders)
    const status1Cell = sheet.getRange(row, status1Col);
    status1Cell.setBorder(true, false, true, false, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    
    // Second status column - no left border, has right border
    const status2Cell = sheet.getRange(row, status2Col);
    status2Cell.setBorder(true, false, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  }
  
  // Right border for column V (column 22)
  const rightCell = sheet.getRange(row, 22);
  rightCell.setBorder(true, false, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
}

// ============================================================================
// TIME SLOT CATEGORIZATION AND CONFLICT DETECTION
// ============================================================================

/**
 * Categorize time slot as weekday, weekend, or non-standard
 * @param {string} timeSlot - Time slot string (e.g., "16:45 - 18:15")
 * @returns {string} 'weekday', 'weekend', or 'nonstandard'
 */
function categorizeTimeSlot(timeSlot) {
  if (!timeSlot) return 'nonstandard';
  
  // Weekday slots (2 slots)
  const weekdaySlots = [
    '16:45 - 18:15',
    '18:25 - 19:55'
  ];
  
  // Weekend slots (5 slots)
  const weekendSlots = [
    '10:00 - 11:30',
    '11:45 - 13:15',
    '14:30 - 16:00',
    '16:15 - 17:45',
    '18:00 - 19:30'
  ];
  
  if (weekdaySlots.includes(timeSlot)) return 'weekday';
  if (weekendSlots.includes(timeSlot)) return 'weekend';
  
  return 'nonstandard';
}

/**
 * Get time slot background color based on category
 * @param {string} category - Time slot category
 * @returns {string} Background color hex code
 */
function getTimeSlotBackgroundColor(category) {
  const colorMap = {
    'weekday': '#666666',    // Dark grey for weekday slots
    'weekend': '#EFEFEF',    // Light grey for weekend slots  
    'nonstandard': '#FFF9C4' // Light yellow for non-standard slots
  };
  return colorMap[category] || '#F8F9FA'; // Default light gray
}

/**
 * Get time slot text color based on category
 * @param {string} category - Time slot category
 * @returns {string} Text color hex code
 */
function getTimeSlotTextColor(category) {
  const colorMap = {
    'weekday': '#FFFFFF',    // White text for dark grey weekday slots
    'weekend': '#000000',    // Black text for light grey weekend slots  
    'nonstandard': '#000000' // Black text for light yellow non-standard slots
  };
  return colorMap[category] || '#000000'; // Default black
}

/**
 * Parse time slot string to get start and end times in minutes
 * @param {string} timeSlot - Time slot string (e.g., "16:45 - 18:15")
 * @returns {Object} {start: minutes, end: minutes} or null if invalid
 */
function parseTimeSlot(timeSlot) {
  const match = timeSlot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  
  const [, startHour, startMin, endHour, endMin] = match;
  return {
    start: parseInt(startHour) * 60 + parseInt(startMin),
    end: parseInt(endHour) * 60 + parseInt(endMin)
  };
}

/**
 * Check if two time slots overlap
 * @param {string} slot1 - First time slot
 * @param {string} slot2 - Second time slot  
 * @returns {boolean} True if slots overlap
 */
function timeSlotsOverlap(slot1, slot2) {
  const time1 = parseTimeSlot(slot1);
  const time2 = parseTimeSlot(slot2);
  
  if (!time1 || !time2) return false;
  
  // Check for overlap: slot1.start < slot2.end AND slot2.start < slot1.end
  return time1.start < time2.end && time2.start < time1.end;
}

/**
 * Detect same-day time slot overlaps
 * @param {Object} scheduleData - Complete schedule data
 * @param {string} currentTimeSlot - Current time slot being processed
 * @param {string} dayName - Day name (e.g., 'monday')
 * @returns {boolean} True if overlap detected for this day
 */
function detectSameDayOverlap(scheduleData, currentTimeSlot, dayName) {
  const timeSlots = Object.keys(scheduleData.timeSlots);
  
  for (const otherTimeSlot of timeSlots) {
    if (otherTimeSlot === currentTimeSlot) continue;
    
    // Check if other slot has students on the same day
    const otherSlotData = scheduleData.timeSlots[otherTimeSlot];
    if (otherSlotData.days[dayName].students.length > 0) {
      // Check for time overlap
      if (timeSlotsOverlap(currentTimeSlot, otherTimeSlot)) {
        return true;
      }
    }
  }
  
  return false;
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
  if (status.includes('sick leave')) return 'S';
  if (status.includes('make-up') || status.includes('makeup')) return 'M';
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
  return status.includes('rescheduled') || status.includes('no show') || status.includes('sick leave');
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
    return `${startTime}\n\n|\n\n${endTime}`;
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

/**
 * Format date for screenshot header (Sep 03 format with padding)
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDateForScreenshot(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  return `${month} ${day}`;
}

/**
 * Apply screenshot-specific formatting to headers
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {string} tutorName - Tutor's name
 * @param {Date} weekStart - Week start date
 */
function formatScreenshotHeaders(sheet, tutorName, weekStart) {
  // Merge title cell (columns B-T, avoiding year columns)
  sheet.getRange(1, 2, 1, 19).merge(); // B2:T1
  
  // Merge tutor name cell (columns B-T)
  sheet.getRange(2, 2, 1, 19).merge(); // B2:T2
  
  // Merge year cell across 4 cells (U1:V2) for more space
  sheet.getRange(1, 21, 2, 2).merge(); // U1:V2
  
  // Row 1: Class Schedule title - white background, bold, 12px font
  const titleRange = sheet.getRange(1, 1, 1, 22);
  titleRange.setBackground('#FFFFFF');
  titleRange.setFontWeight('bold');
  titleRange.setFontSize(12);  // 12px as requested
  titleRange.setFontFamily('Roboto');  // Roboto font as requested
  titleRange.setHorizontalAlignment('center');
  titleRange.setVerticalAlignment('middle');
  
  // Custom borders for title row (no bottom border from A1 to T1)
  formatTitleRowBorders(sheet);
  
  // Year cell - center aligned in merged cell (now spans U1:V2)
  const yearCell = sheet.getRange(1, 21, 2, 2);
  yearCell.setFontSize(10);
  yearCell.setHorizontalAlignment('center');
  yearCell.setVerticalAlignment('middle');
  
  // Row 2: Tutor name - white background, bold, 12px font
  const tutorRange = sheet.getRange(2, 1, 1, 22);
  tutorRange.setBackground('#FFFFFF');
  tutorRange.setFontWeight('bold');
  tutorRange.setFontSize(12);  // 12px as requested
  tutorRange.setFontFamily('Roboto');  // Roboto font as requested
  tutorRange.setHorizontalAlignment('center');
  tutorRange.setVerticalAlignment('middle');
  
  // Custom borders for tutor row (no left/right for U2, V2)
  formatTutorRowBorders(sheet);
  
  // Row 3: Dates - light grey background, no borders on status columns
  formatHeaderRowWithoutStatusBorders(sheet, 3, '#EFEFEF', '#000000');
  
  // Row 4: Day names - dark grey background, no borders on status columns
  formatHeaderRowWithoutStatusBorders(sheet, 4, '#666666', '#FFFFFF');
  
  // Set row heights as requested
  sheet.setRowHeight(1, 20);  // Title row (20px as requested)
  sheet.setRowHeight(2, 20);  // Tutor name row (20px as requested)  
  sheet.setRowHeight(3, 20);  // Date row (20px as requested)
  sheet.setRowHeight(4, 20);  // Day of week row (20px as requested)
}

// ============================================================================
// OVERLAP DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect if the given time slot overlaps with other time slots on the same day
 * @param {string} timeSlot - The time slot to check (e.g., "10:00 - 11:30")
 * @param {Object} scheduleData - Complete schedule data
 * @returns {boolean} True if there are same-day overlaps
 */
function detectSameDayOverlaps(timeSlot, scheduleData) {
  if (!timeSlot || !scheduleData || !scheduleData.timeSlots) {
    return false;
  }
  
  // Parse the target time slot
  const targetSlot = parseTimeSlotForOverlap(timeSlot);
  if (!targetSlot) {
    return false;
  }
  
  // Check each day for overlaps with other time slots
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  for (const day of days) {
    // Get all time slots that have students on this day
    const activeSlotsOnDay = [];
    
    for (const [otherTimeSlot, slotData] of Object.entries(scheduleData.timeSlots)) {
      if (otherTimeSlot !== timeSlot && slotData.days[day].students.length > 0) {
        const otherSlot = parseTimeSlotForOverlap(otherTimeSlot);
        if (otherSlot) {
          activeSlotsOnDay.push(otherSlot);
        }
      }
    }
    
    // Check if target slot overlaps with any other slot on this day
    for (const otherSlot of activeSlotsOnDay) {
      if (timeSlotsOverlap(targetSlot, otherSlot)) {
        return true; // Found an overlap
      }
    }
  }
  
  return false; // No overlaps found
}

/**
 * Parse time slot string into start/end minutes for overlap calculation
 * @param {string} timeSlot - Time slot string (e.g., "10:00 - 11:30")
 * @returns {Object|null} Object with startMinutes and endMinutes, or null if invalid
 */
function parseTimeSlotForOverlap(timeSlot) {
  if (!timeSlot) return null;
  
  const match = timeSlot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  
  const [, startHour, startMin, endHour, endMin] = match;
  
  return {
    startMinutes: parseInt(startHour) * 60 + parseInt(startMin),
    endMinutes: parseInt(endHour) * 60 + parseInt(endMin)
  };
}

/**
 * Check if two time slots overlap
 * @param {Object} slot1 - First time slot with startMinutes and endMinutes
 * @param {Object} slot2 - Second time slot with startMinutes and endMinutes  
 * @returns {boolean} True if slots overlap
 */
function timeSlotsOverlap(slot1, slot2) {
  // Slots overlap if: start1 < end2 AND start2 < end1
  return slot1.startMinutes < slot2.endMinutes && slot2.startMinutes < slot1.endMinutes;
}

/**
 * Detect if the given time slot overlaps with other time slots on a specific day
 * @param {Object} scheduleData - Complete schedule data
 * @param {string} timeSlot - The time slot to check (e.g., "10:00 - 11:30")
 * @param {string} dayName - The specific day to check (e.g., "monday")
 * @returns {boolean} True if there are overlaps on that day
 */
function detectSameDayOverlap(scheduleData, timeSlot, dayName) {
  if (!scheduleData || !scheduleData.timeSlots || !timeSlot || !dayName) {
    return false;
  }
  
  // Parse the target time slot
  const targetSlot = parseTimeSlotForOverlap(timeSlot);
  if (!targetSlot) {
    return false;
  }
  
  // Check this specific day for overlaps with other time slots
  for (const [otherTimeSlot, slotData] of Object.entries(scheduleData.timeSlots)) {
    if (otherTimeSlot !== timeSlot && slotData.days[dayName].students.length > 0) {
      const otherSlot = parseTimeSlotForOverlap(otherTimeSlot);
      if (otherSlot && timeSlotsOverlap(targetSlot, otherSlot)) {
        return true; // Found an overlap on this day
      }
    }
  }
  
  return false; // No overlaps found on this day
}

/**
 * Detect special days (RDO, holidays, empty) for dynamic column width
 * @param {Object} scheduleData - Schedule data
 * @param {Array} rdoDays - Array of RDO day numbers (0=Sunday, etc.)
 * @param {Array} holidays - Array of holiday objects {date, name}
 * @param {Date} weekStart - Start of week (Sunday)
 * @param {Array} dayNames - Day names array
 * @returns {Object} Object with arrays of special days
 */
function detectSpecialDays(scheduleData, rdoDays, holidays, weekStart, dayNames) {
  const specialDays = {
    rdo: [],      // Regular days off (narrow, grey)
    holidays: [], // Public holidays (narrow, different color)
    empty: []     // No students but not RDO (normal width, available)
  };
  
  for (let i = 0; i < dayNames.length; i++) {
    const dayName = dayNames[i];
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + i);
    
    // Check if it's RDO
    if (rdoDays.includes(i)) {
      specialDays.rdo.push(dayName);
      continue;
    }
    
    // Check if it's a holiday
    const isHoliday = holidays.some(h => {
      const holidayDate = new Date(h.date);
      return holidayDate.getDate() === dayDate.getDate() && 
             holidayDate.getMonth() === dayDate.getMonth() &&
             holidayDate.getFullYear() === dayDate.getFullYear();
    });
    
    if (isHoliday) {
      specialDays.holidays.push(dayName);
      continue;
    }
    
    // Check if empty (no students)
    let hasStudents = false;
    for (const [timeSlot, slotData] of Object.entries(scheduleData.timeSlots || {})) {
      if (slotData.days[dayName] && slotData.days[dayName].students.length > 0) {
        hasStudents = true;
        break;
      }
    }
    
    if (!hasStudents) {
      specialDays.empty.push(dayName);
    }
  }
  
  return specialDays;
}