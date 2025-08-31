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
 * Creates custom menu when spreadsheet opens
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
    'This will refresh all schedule weeks. It may take a few minutes.\n\nProceed?', 
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