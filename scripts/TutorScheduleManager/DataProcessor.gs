/**
 * DATA PROCESSING AND FORMATTING FUNCTIONS
 * 
 * Handles transformation of raw database data into structured schedule format
 */

// ============================================================================
// MAIN DATA PROCESSING
// ============================================================================

/**
 * Transform raw session data into structured schedule format
 * @param {Array} sessions - Raw session data from database
 * @param {Date} weekStart - Monday of the week
 * @returns {Object} Structured schedule data
 */
function formatScheduleData(sessions, weekStart) {
  Logger.log(`Formatting ${sessions.length} sessions for week starting ${formatDate(weekStart)}`);
  
  const scheduleData = {
    weekStart: weekStart,
    timeSlots: {}
  };
  
  // Group sessions by time slot and day
  for (const session of sessions) {
    const timeSlot = session.time_slot;
    const dayName = getDayName(session.session_date);
    
    // Initialize time slot if not exists
    if (!scheduleData.timeSlots[timeSlot]) {
      scheduleData.timeSlots[timeSlot] = {
        days: {
          sunday: { students: [], classGrade: '' },
          monday: { students: [], classGrade: '' },
          tuesday: { students: [], classGrade: '' },
          wednesday: { students: [], classGrade: '' },
          thursday: { students: [], classGrade: '' },
          friday: { students: [], classGrade: '' },
          saturday: { students: [], classGrade: '' }
        }
      };
    }
    
    // Add student to appropriate day
    scheduleData.timeSlots[timeSlot].days[dayName].students.push(session);
  }
  
  // Determine class grades and sort students for each day/time slot combination
  for (const timeSlot of Object.keys(scheduleData.timeSlots)) {
    for (const dayName of Object.keys(scheduleData.timeSlots[timeSlot].days)) {
      const dayData = scheduleData.timeSlots[timeSlot].days[dayName];
      
      if (dayData.students.length > 0) {
        // Determine the class grade first
        dayData.classGrade = determineClassGrade(dayData.students);
        
        // Sort students by majority grade/stream first, then by student ID
        dayData.students = sortStudentsByGradeAndId(dayData.students, dayData.classGrade);
      }
    }
  }
  
  Logger.log(`Processed data into ${Object.keys(scheduleData.timeSlots).length} time slots`);
  return scheduleData;
}

/**
 * Determine class grade based on majority rule from non-makeup students
 * @param {Array} sessions - Sessions for a specific time/day slot
 * @returns {string} Class grade (e.g., "F1 E", "F2 C")
 */
function determineClassGrade(sessions) {
  if (!sessions || sessions.length === 0) return '';
  
  // Count grade-stream combinations from non-makeup students
  const gradeStreamCount = {};
  let totalNonMakeup = 0;
  
  for (const session of sessions) {
    // Skip makeup classes for grade determination
    if (session.session_status && session.session_status.toLowerCase().includes('make-up')) {
      continue;
    }
    
    // Only count if both grade and stream are present
    if (session.grade && session.lang_stream) {
      const combination = `${session.grade} ${session.lang_stream}`;
      gradeStreamCount[combination] = (gradeStreamCount[combination] || 0) + 1;
      totalNonMakeup++;
    }
  }
  
  // If no non-makeup students with complete grade/stream info, return empty
  if (totalNonMakeup === 0) return '';
  
  // Find the grade-stream combination with the highest count
  let majorityCombination = '';
  let maxCount = 0;
  
  for (const [combination, count] of Object.entries(gradeStreamCount)) {
    if (count > maxCount) {
      maxCount = count;
      majorityCombination = combination;
    }
  }
  
  return majorityCombination;
}

/**
 * Sort students by session status first, then majority grade/stream, then by student ID
 * This ensures regular students always appear before make-up students
 * @param {Array} students - Array of student session objects
 * @param {string} majorityGradeStream - The majority grade/stream (e.g., "F1 E")
 * @returns {Array} Sorted array of students
 */
function sortStudentsByGradeAndId(students, majorityGradeStream) {
  return students.sort((a, b) => {
    // Priority 1: Regular students (scheduled/rescheduled) always come before make-up/trial
    const aPriority = getSessionStatusPriority(a.session_status);
    const bPriority = getSessionStatusPriority(b.session_status);
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Priority 2: Within same session type, majority grade/stream comes first
    const aGradeStream = `${a.grade || ''} ${a.lang_stream || ''}`.trim();
    const bGradeStream = `${b.grade || ''} ${b.lang_stream || ''}`.trim();
    const aIsMajority = aGradeStream === majorityGradeStream;
    const bIsMajority = bGradeStream === majorityGradeStream;
    
    if (aIsMajority && !bIsMajority) return -1; // a comes first
    if (!aIsMajority && bIsMajority) return 1;  // b comes first
    
    // Priority 3: If both have same session type and grade/stream status, sort by student ID
    const aId = parseInt(a.school_student_id) || 0;
    const bId = parseInt(b.school_student_id) || 0;
    
    return aId - bId; // Ascending order by student ID
  });
}

/**
 * Get day name from date
 * @param {Date} date - Date object
 * @returns {string} Day name in lowercase (sunday, monday, etc.)
 */
function getDayName(date) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

// ============================================================================
// TIME SLOT PROCESSING
// ============================================================================

/**
 * Parse and normalize time slot format
 * @param {string} timeSlot - Raw time slot string (e.g., "10:00 - 11:30")
 * @returns {Object} Parsed time slot with start/end times
 */
function parseTimeSlot(timeSlot) {
  if (!timeSlot) return null;
  
  try {
    // Handle various time formats
    const timeRegex = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
    const match = timeSlot.match(timeRegex);
    
    if (match) {
      const [, startHour, startMin, endHour, endMin] = match;
      return {
        original: timeSlot,
        startTime: `${startHour.padStart(2, '0')}:${startMin}`,
        endTime: `${endHour.padStart(2, '0')}:${endMin}`,
        sortKey: parseInt(startHour) * 60 + parseInt(startMin)
      };
    }
    
    // Fallback for single time format
    const singleTimeRegex = /(\d{1,2}):(\d{2})/;
    const singleMatch = timeSlot.match(singleTimeRegex);
    
    if (singleMatch) {
      const [, hour, min] = singleMatch;
      return {
        original: timeSlot,
        startTime: `${hour.padStart(2, '0')}:${min}`,
        endTime: null,
        sortKey: parseInt(hour) * 60 + parseInt(min)
      };
    }
    
    // If can't parse, return original
    return {
      original: timeSlot,
      startTime: timeSlot,
      endTime: null,
      sortKey: 0
    };
    
  } catch (error) {
    Logger.log(`Error parsing time slot "${timeSlot}": ${error.toString()}`);
    return {
      original: timeSlot,
      startTime: timeSlot,
      endTime: null,
      sortKey: 0
    };
  }
}

/**
 * Sort time slots in chronological order
 * @param {Array} timeSlots - Array of time slot strings
 * @returns {Array} Sorted time slot strings
 */
function sortTimeSlots(timeSlots) {
  return timeSlots.sort((a, b) => {
    const parsedA = parseTimeSlot(a);
    const parsedB = parseTimeSlot(b);
    return parsedA.sortKey - parsedB.sortKey;
  });
}

// ============================================================================
// STATUS AND FORMATTING HELPERS
// ============================================================================

/**
 * Determine if session should have strikethrough formatting
 * @param {string} sessionStatus - Session status from database
 * @returns {boolean} True if should be struck through
 */
function shouldStrikethrough(sessionStatus) {
  if (!sessionStatus) return false;
  
  const status = sessionStatus.toLowerCase();
  return status.includes('rescheduled') || status.includes('no show');
}

/**
 * Get color code for session status
 * @param {string} sessionStatus - Session status from database
 * @returns {string} Hex color code
 */
function getStatusColor(sessionStatus) {
  if (!sessionStatus) return '#FFFFFF'; // White default
  
  const status = sessionStatus.toLowerCase();
  
  if (status.includes('make-up') || status.includes('makeup')) return '#FFF2CC'; // Light yellow
  if (status.includes('rescheduled')) return '#FCE5CD'; // Light orange
  if (status.includes('sick')) return '#F4CCCC'; // Light red
  if (status.includes('trial')) return '#D0E0E3'; // Light blue
  if (status.includes('confirmed') || status.includes('confirm')) return '#D9D9D9'; // Light gray
  
  return '#FFFFFF'; // White for scheduled
}

/**
 * Get priority order for session status (for sorting within time slots)
 * @param {string} sessionStatus - Session status from database
 * @returns {number} Priority order (lower = higher priority)
 */
function getSessionStatusPriority(sessionStatus) {
  if (!sessionStatus) return 5;
  
  const status = sessionStatus.toLowerCase();
  
  // Treat scheduled, rescheduled, and attended as priority 1 (regular sessions)
  // Note: "Attended" means the lesson happened, should be sorted same as scheduled
  if (status.includes('scheduled') || status.includes('rescheduled') || status.includes('attended')) return 1;
  if (status.includes('make-up') || status.includes('makeup')) return 2;
  if (status.includes('trial')) return 3;
  if (status.includes('confirm')) return 4; // "To be Confirmed"
  
  return 5; // Others last
}

/**
 * Sort students within a time slot by priority and name
 * @param {Array} students - Array of student session objects
 * @returns {Array} Sorted array of students
 * @deprecated Use sortStudentsByGradeAndId instead for comprehensive sorting
 */
function sortStudentsInTimeSlot(students) {
  return students.sort((a, b) => {
    // First sort by session priority
    const priorityA = getSessionStatusPriority(a.session_status);
    const priorityB = getSessionStatusPriority(b.session_status);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Then sort by student name
    return (a.student_name || '').localeCompare(b.student_name || '');
  });
}

// ============================================================================
// VALIDATION AND ERROR HANDLING
// ============================================================================

/**
 * Validate schedule data structure
 * @param {Object} scheduleData - Schedule data to validate
 * @returns {boolean} True if valid
 */
function validateScheduleData(scheduleData) {
  if (!scheduleData || typeof scheduleData !== 'object') {
    Logger.log('Invalid schedule data: not an object');
    return false;
  }
  
  if (!scheduleData.timeSlots || typeof scheduleData.timeSlots !== 'object') {
    Logger.log('Invalid schedule data: missing or invalid timeSlots');
    return false;
  }
  
  if (!scheduleData.weekStart || !(scheduleData.weekStart instanceof Date)) {
    Logger.log('Invalid schedule data: missing or invalid weekStart');
    return false;
  }
  
  // Validate time slot structure
  for (const [timeSlot, slotData] of Object.entries(scheduleData.timeSlots)) {
    if (!slotData.days || typeof slotData.days !== 'object') {
      Logger.log(`Invalid time slot data for ${timeSlot}: missing days`);
      return false;
    }
    
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of requiredDays) {
      if (!slotData.days[day] || !Array.isArray(slotData.days[day].students)) {
        Logger.log(`Invalid day data for ${timeSlot} ${day}: missing or invalid students array`);
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Clean and sanitize student data
 * @param {Object} student - Raw student session object
 * @returns {Object} Cleaned student object
 */
function cleanStudentData(student) {
  return {
    session_id: student.session_id || null,
    session_date: student.session_date || null,
    time_slot: (student.time_slot || '').trim(),
    location: (student.location || '').trim(),
    session_status: (student.session_status || 'Scheduled').trim(),
    financial_status: (student.financial_status || '').trim(),
    attendance_marked_by: (student.attendance_marked_by || '').trim(),
    notes: (student.notes || '').trim(),
    school_student_id: (student.school_student_id || '').trim(),
    student_name: (student.student_name || '').trim(),
    grade: (student.grade || '').trim(),
    lang_stream: (student.lang_stream || '').trim(),
    school: (student.school || '').trim()
  };
}

// ============================================================================
// TEST AND DEBUG FUNCTIONS
// ============================================================================

/**
 * Test data processing with sample data
 */
function testDataProcessing() {
  const sampleSessions = [
    {
      session_id: 1,
      session_date: new Date('2025-09-01'),
      time_slot: '10:00 - 11:30',
      location: 'F2',
      session_status: 'Scheduled',
      financial_status: 'Paid',
      attendance_marked_by: null,
      notes: '',
      school_student_id: '1234',
      student_name: 'John Doe',
      grade: 'F2',
      lang_stream: 'E',
      school: 'ABC School'
    },
    {
      session_id: 2,
      session_date: new Date('2025-09-01'),
      time_slot: '10:00 - 11:30',
      location: 'F2',
      session_status: 'Make-up Class',
      financial_status: 'Paid',
      attendance_marked_by: null,
      notes: '',
      school_student_id: '5678',
      student_name: 'Jane Smith',
      grade: 'F1',
      lang_stream: 'E',
      school: 'XYZ School'
    }
  ];
  
  const weekStart = getMondayOfWeek(new Date('2025-09-01'));
  const result = formatScheduleData(sampleSessions, weekStart);
  
  Logger.log('Test result:');
  Logger.log(JSON.stringify(result, null, 2));
  
  return result;
}