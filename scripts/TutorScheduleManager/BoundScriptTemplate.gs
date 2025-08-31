/**
 * TUTOR SPREADSHEET BOUND SCRIPT TEMPLATE
 * 
 * This minimal script connects to the main TutorScheduleManager library.
 * Copy this code to each tutor spreadsheet's bound Apps Script.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open the tutor spreadsheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this template
 * 4. Add TutorScheduleManager library:
 *    - Click Libraries (+) in the left sidebar
 *    - Enter the Script ID: [YOUR_SCRIPT_ID_HERE]
 *    - Set Identifier to: TutorScheduleManager
 *    - Select latest version and save
 * 5. Save the script and refresh the spreadsheet
 * 
 * The "📅 Tutor Schedule" menu should now appear in the menu bar.
 */

/**
 * Creates custom menu when spreadsheet opens and navigates to current week
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('📅 Tutor Schedule')
      .addItem('🔄 Refresh All Weeks', 'refreshAllWeeks')
      .addItem('📍 Refresh Current Week', 'refreshCurrentWeek')
      .addSeparator()
      .addItem('ℹ️ About', 'showAbout')
      .addToUi();
      
    // Automatically navigate to current week tab
    navigateToCurrentWeek();
      
    Logger.log('Tutor Schedule menu created successfully');
  } catch (error) {
    Logger.log(`Error creating menu: ${error.toString()}`);
  }
}

/**
 * Refreshes all weeks for this tutor
 */
function refreshAllWeeks() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Confirm action
  const response = ui.alert(
    'Refresh All Weeks', 
    'This will refresh current and future weeks only.\nPast weeks will not be updated to save time.\n\nProceed?', 
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  try {
    // Use toast for non-blocking notification
    spreadsheet.toast('Refreshing all weeks... Please wait.', '⏳ Processing', -1);
    
    // Call the main library function
    const result = TutorScheduleManager.refreshSpreadsheetSchedule(spreadsheetId);
    
    // Clear toast
    spreadsheet.toast('', '', 1);
    
    if (result.success) {
      ui.alert(
        'Success! ✅', 
        'Schedule refreshed successfully for ' + result.tutorName + '\n\n' +
        'All weekly tabs have been updated with the latest data.',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        'Error ❌', 
        'Failed to refresh schedule:\n\n' + result.message + '\n\n' +
        'Please contact your administrator if the problem persists.',
        ui.ButtonSet.OK
      );
    }
  } catch (error) {
    // Clear toast on error
    spreadsheet.toast('', '', 1);
    ui.alert(
      'Error ❌', 
      'An unexpected error occurred:\n\n' + error.toString() + '\n\n' +
      'Please check that the TutorScheduleManager library is properly configured.',
      ui.ButtonSet.OK
    );
  }
}

/**
 * Refreshes only the current week for this tutor
 */
function refreshCurrentWeek() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Use toast for non-blocking notification
    spreadsheet.toast('Refreshing current week...', '⏳ Processing', -1);
    
    // Call the main library function
    const result = TutorScheduleManager.refreshSpreadsheetCurrentWeek(spreadsheetId);
    
    // Clear toast
    spreadsheet.toast('', '', 1);
    
    if (result.success) {
      ui.alert(
        'Success! ✅', 
        'Current week refreshed successfully for ' + result.tutorName + '\n\n' +
        'The current week tab has been updated with the latest data.',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        'Error ❌', 
        'Failed to refresh current week:\n\n' + result.message + '\n\n' +
        'Please contact your administrator if the problem persists.',
        ui.ButtonSet.OK
      );
    }
  } catch (error) {
    // Clear toast on error
    spreadsheet.toast('', '', 1);
    ui.alert(
      'Error ❌', 
      'An unexpected error occurred:\n\n' + error.toString() + '\n\n' +
      'Please check that the TutorScheduleManager library is properly configured.',
      ui.ButtonSet.OK
    );
  }
}

/**
 * Automatically navigate to the current week tab when spreadsheet opens
 */
function navigateToCurrentWeek() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Calculate current week in GMT+8 timezone (same logic as main system)
    const now = new Date();
    const gmt8Offset = 8 * 60; // GMT+8 in minutes
    const localOffset = now.getTimezoneOffset(); // Local timezone offset from UTC
    const gmt8Time = new Date(now.getTime() + (gmt8Offset + localOffset) * 60000);
    
    // Get Sunday of current week
    const currentWeekStart = getSundayOfWeek(gmt8Time);
    const currentWeekTabName = formatWeekLabel(currentWeekStart);
    
    // Try to find and activate current week tab
    const currentWeekSheet = spreadsheet.getSheetByName(currentWeekTabName);
    if (currentWeekSheet) {
      spreadsheet.setActiveSheet(currentWeekSheet);
      Logger.log(`✅ Navigated to current week: ${currentWeekTabName}`);
    } else {
      Logger.log(`⚠️ Current week tab not found: ${currentWeekTabName}`);
      // Fall back to first non-instructions sheet
      const sheets = spreadsheet.getSheets();
      for (const sheet of sheets) {
        if (!sheet.getName().toLowerCase().includes('instructions')) {
          spreadsheet.setActiveSheet(sheet);
          Logger.log(`📍 Navigated to: ${sheet.getName()}`);
          break;
        }
      }
    }
  } catch (error) {
    Logger.log(`Warning: Could not navigate to current week: ${error.toString()}`);
  }
}

/**
 * Get Sunday date of the week containing the given date
 * @param {Date} date - Input date
 * @returns {Date} Sunday of that week
 */
function getSundayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

/**
 * Format week start date as tab label (MMDD-MMDD format)
 * @param {Date} weekStart - Sunday date
 * @returns {string} Tab label like "0831-0906"
 */
function formatWeekLabel(weekStart) {
  const startMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
  const startDay = String(weekStart.getDate()).padStart(2, '0');
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Saturday
  
  const endMonth = String(weekEnd.getMonth() + 1).padStart(2, '0');
  const endDay = String(weekEnd.getDate()).padStart(2, '0');
  
  return `${startMonth}${startDay}-${endMonth}${endDay}`;
}

/**
 * Shows information about the Tutor Schedule Manager
 */
function showAbout() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheetName = SpreadsheetApp.getActiveSpreadsheet().getName();
  
  ui.alert(
    'About Tutor Schedule Manager',
    '📊 Spreadsheet: ' + spreadsheetName + '\n\n' +
    '🤖 Version: 1.0\n' +
    '⏰ Automatic Updates: 12:00 AM & 2:00 PM daily\n' +
    '🎨 Features: Current week highlighting, chronological tabs\n' +
    '📱 Support: Contact your system administrator\n\n' +
    '💡 Use the refresh options above to manually update your schedule.',
    ui.ButtonSet.OK
  );
}

/**
 * Test function to verify library connection
 * Run this from the Apps Script editor to test the setup
 */
function testLibraryConnection() {
  try {
    const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    Logger.log(`Testing library connection for spreadsheet: ${spreadsheetId}`);
    
    // Test if library is accessible
    if (typeof TutorScheduleManager === 'undefined') {
      Logger.log('❌ TutorScheduleManager library not found. Check library setup.');
      return false;
    }
    
    Logger.log('✅ TutorScheduleManager library connected successfully');
    
    // Test a simple call (you can comment this out if you don't want to trigger a refresh)
    // const result = TutorScheduleManager.refreshSpreadsheetCurrentWeek(spreadsheetId);
    // Logger.log('Library test result:', result);
    
    return true;
  } catch (error) {
    Logger.log(`❌ Library connection test failed: ${error.toString()}`);
    return false;
  }
}