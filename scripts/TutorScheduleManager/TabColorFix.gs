/**
 * TAB COLOR FIX - Testing and Verification Functions
 * 
 * These functions help test and verify that the tab color highlighting
 * works correctly with proper GMT+8 timezone handling.
 */

/**
 * Test function to verify current week detection with different dates
 * Run this to ensure timezone calculations are working correctly
 */
function testCurrentWeekDetection() {
  Logger.log('=== Testing Current Week Detection ===');
  
  // Get current time in GMT+8
  const now = new Date();
  const gmt8Offset = 8 * 60; // GMT+8 in minutes
  const localOffset = now.getTimezoneOffset(); // Local timezone offset from UTC  
  const gmt8Time = new Date(now.getTime() + (gmt8Offset + localOffset) * 60000);
  
  Logger.log(`Server time: ${now.toISOString()}`);
  Logger.log(`GMT+8 time: ${gmt8Time.toISOString()}`);
  Logger.log(`Day of week (GMT+8): ${gmt8Time.getDay()} (0=Sunday, 6=Saturday)`);
  
  // Calculate current week Sunday
  const currentWeek = getSundayOfWeek(gmt8Time);
  Logger.log(`Current week Sunday: ${currentWeek.toISOString()}`);
  Logger.log(`Current week tab name: ${formatWeekLabel(currentWeek)}`);
  
  // Test edge cases around Sunday
  const testDates = [
    new Date(currentWeek.getTime() - 24 * 60 * 60 * 1000), // Saturday before
    currentWeek, // Sunday (current week start)
    new Date(currentWeek.getTime() + 24 * 60 * 60 * 1000), // Monday
    new Date(currentWeek.getTime() + 6 * 24 * 60 * 60 * 1000), // Saturday (end of current week)
    new Date(currentWeek.getTime() + 7 * 24 * 60 * 60 * 1000), // Sunday (next week)
  ];
  
  Logger.log('\n=== Testing Edge Cases ===');
  testDates.forEach((testDate, i) => {
    const testWeek = getSundayOfWeek(testDate);
    const isCurrent = isCurrentWeek(testWeek, currentWeek);
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][testDate.getDay()];
    Logger.log(`Test ${i+1}: ${testDate.toISOString()} (${dayName}) -> Week: ${formatWeekLabel(testWeek)}, Current: ${isCurrent}`);
  });
}

/**
 * Fix tab colors for a specific tutor (manual override)
 * Use this if you need to manually fix tab colors for testing
 * @param {number} tutorId - Tutor database ID
 */
function fixTabColorsForTutor(tutorId) {
  Logger.log(`=== Manual Tab Color Fix for Tutor ${tutorId} ===`);
  
  try {
    const tutor = getTutorById(tutorId);
    if (!tutor) {
      throw new Error(`Tutor not found with ID: ${tutorId}`);
    }
    
    const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    // Calculate current week once in GMT+8 timezone
    const now = new Date();
    const gmt8Offset = 8 * 60; // GMT+8 in minutes
    const localOffset = now.getTimezoneOffset(); // Local timezone offset from UTC
    const gmt8Time = new Date(now.getTime() + (gmt8Offset + localOffset) * 60000);
    const currentWeek = getSundayOfWeek(gmt8Time);
    
    Logger.log(`Tutor: ${tutor.tutor_name}`);
    Logger.log(`Current week: ${formatDate(currentWeek)} (${formatWeekLabel(currentWeek)})`);
    
    // Clear all colors and set current week to green
    clearAllTabColorsExceptCurrent(spreadsheet, currentWeek);
    
    Logger.log(`✅ Fixed tab colors for ${tutor.tutor_name}`);
    
  } catch (error) {
    Logger.log(`❌ Error fixing tab colors: ${error.toString()}`);
    throw error;
  }
}

/**
 * Check all tutors' spreadsheets for correct tab highlighting
 * Run this to audit tab colors across all tutors
 */
function auditAllTutorTabColors() {
  Logger.log('=== Auditing Tab Colors for All Tutors ===');
  
  try {
    // Calculate current week once  
    const now = new Date();
    const gmt8Offset = 8 * 60; // GMT+8 in minutes
    const localOffset = now.getTimezoneOffset(); // Local timezone offset from UTC
    const gmt8Time = new Date(now.getTime() + (gmt8Offset + localOffset) * 60000);
    const currentWeek = getSundayOfWeek(gmt8Time);
    const currentWeekTabName = formatWeekLabel(currentWeek);
    
    Logger.log(`Current week should be: ${currentWeekTabName}`);
    Logger.log('');
    
    const tutors = getTutorList();
    let totalIssues = 0;
    
    for (const tutor of tutors) {
      try {
        const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
        const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        const sheets = spreadsheet.getSheets();
        
        let greenTabs = [];
        let issues = [];
        
        for (const sheet of sheets) {
          const tabName = sheet.getName();
          const tabColor = sheet.getTabColor();
          
          // Skip instructions sheet
          if (tabName.toLowerCase().includes('instructions')) {
            continue;
          }
          
          if (tabColor === '#34A853' || tabColor === '#34a853') { // Google green (case insensitive)
            greenTabs.push(tabName);
          }
          
          // Check if this should be current week
          const weekStart = getWeekStartFromTabName(tabName);
          if (weekStart && isCurrentWeek(weekStart, currentWeek)) {
            if (!tabColor || (tabColor !== '#34A853' && tabColor !== '#34a853')) {
              issues.push(`❌ Current week tab '${tabName}' is not green (color: ${tabColor || 'none'})`);
            }
          } else if (tabColor === '#34A853' || tabColor === '#34a853') {
            issues.push(`⚠️ Non-current week tab '${tabName}' is green`);
          }
        }
        
        // Report results for this tutor
        if (issues.length === 0 && greenTabs.length === 1 && greenTabs[0] === currentWeekTabName) {
          Logger.log(`✅ ${tutor.tutor_name}: Correct (${currentWeekTabName} is green)`);
        } else {
          Logger.log(`❌ ${tutor.tutor_name}: Issues found`);
          Logger.log(`   Green tabs: ${greenTabs.join(', ') || 'none'}`);
          issues.forEach(issue => Logger.log(`   ${issue}`));
          totalIssues++;
        }
        
      } catch (tutorError) {
        Logger.log(`❌ ${tutor.tutor_name}: Error accessing spreadsheet - ${tutorError.toString()}`);
        totalIssues++;
      }
    }
    
    Logger.log('');
    Logger.log('=== Audit Summary ===');
    Logger.log(`Total tutors checked: ${tutors.length}`);
    Logger.log(`Tutors with issues: ${totalIssues}`);
    Logger.log(`Current week should be: ${currentWeekTabName}`);
    
    if (totalIssues > 0) {
      Logger.log('');
      Logger.log('💡 To fix all issues, run: fixAllTutorTabColors()');
    }
    
  } catch (error) {
    Logger.log(`❌ Error during audit: ${error.toString()}`);
    throw error;
  }
}

/**
 * Fix tab colors for all tutors (batch operation)
 * Use this to ensure all tutors have correct tab highlighting
 */
function fixAllTutorTabColors() {
  Logger.log('=== Fixing Tab Colors for All Tutors ===');
  
  try {
    // Calculate current week once for consistency
    const now = new Date();
    const gmt8Offset = 8 * 60; // GMT+8 in minutes
    const localOffset = now.getTimezoneOffset(); // Local timezone offset from UTC
    const gmt8Time = new Date(now.getTime() + (gmt8Offset + localOffset) * 60000);
    const currentWeek = getSundayOfWeek(gmt8Time);
    
    Logger.log(`Current week: ${formatDate(currentWeek)} (${formatWeekLabel(currentWeek)})`);
    Logger.log('');
    
    const tutors = getTutorList();
    let successCount = 0;
    let errorCount = 0;
    
    for (const tutor of tutors) {
      try {
        const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
        const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        
        clearAllTabColorsExceptCurrent(spreadsheet, currentWeek);
        Logger.log(`✅ Fixed: ${tutor.tutor_name}`);
        successCount++;
        
        // Small delay to prevent rate limiting
        Utilities.sleep(500);
        
      } catch (tutorError) {
        Logger.log(`❌ Error fixing ${tutor.tutor_name}: ${tutorError.toString()}`);
        errorCount++;
      }
    }
    
    Logger.log('');
    Logger.log('=== Fix Summary ===');
    Logger.log(`Total tutors: ${tutors.length}`);
    Logger.log(`Successfully fixed: ${successCount}`);  
    Logger.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    Logger.log(`❌ Critical error during batch fix: ${error.toString()}`);
    throw error;
  }
}

/**
 * Helper function to extract week start date from tab name
 * @param {string} tabName - Tab name like "0901-0907" 
 * @returns {Date|null} - Sunday date or null if invalid
 */
function getWeekStartFromTabName(tabName) {
  try {
    // Tab name format: "MMDD-MMDD" like "0901-0907"
    const match = tabName.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (!match) return null;
    
    const startMonth = parseInt(match[1]) - 1; // Month is 0-indexed
    const startDay = parseInt(match[2]);
    
    // Assume current year for simplicity
    const currentYear = new Date().getFullYear();
    const weekStart = new Date(currentYear, startMonth, startDay);
    
    // Verify it's actually a Sunday
    if (weekStart.getDay() !== 0) {
      Logger.log(`Warning: Tab '${tabName}' doesn't start on Sunday`);
    }
    
    return weekStart;
    
  } catch (error) {
    Logger.log(`Error parsing tab name '${tabName}': ${error.toString()}`);
    return null;
  }
}