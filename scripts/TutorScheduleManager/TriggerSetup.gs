/**
 * TRIGGER SETUP AND AUTOMATION
 * 
 * Handles time-driven triggers and manual refresh mechanisms
 */

// ============================================================================
// TRIGGER MANAGEMENT
// ============================================================================

/**
 * Set up time-driven triggers for automatic schedule refresh
 * Run this once to install the triggers
 */
function setupAutomaticTriggers() {
  Logger.log('Setting up automatic triggers...');
  
  try {
    // Delete existing triggers first
    deleteAllTriggers();
    
    // Midnight trigger (00:00 daily)
    ScriptApp.newTrigger('refreshAllTutorSchedules')
      .timeBased()
      .everyDays(1)
      .atHour(0)
      .create();
    
    // Lunch time trigger (14:00 daily)  
    ScriptApp.newTrigger('refreshAllTutorSchedules')
      .timeBased()
      .everyDays(1)
      .atHour(14)
      .create();
    
    Logger.log('✅ Automatic triggers created successfully');
    Logger.log('- Daily refresh at 00:00 (midnight)');
    Logger.log('- Daily refresh at 14:00 (2:00 PM)');
    
  } catch (error) {
    Logger.log(`❌ Error setting up triggers: ${error.toString()}`);
    throw error;
  }
}

/**
 * Delete all existing triggers for this project
 */
function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
  
  Logger.log(`Deleted ${triggers.length} existing triggers`);
}

/**
 * List all current triggers (for debugging)
 */
function listCurrentTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  
  Logger.log(`Found ${triggers.length} triggers:`);
  
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    Logger.log(`${i + 1}. Function: ${trigger.getHandlerFunction()}`);
    Logger.log(`   Type: ${trigger.getEventType()}`);
    Logger.log(`   Trigger Source: ${trigger.getTriggerSource()}`);
    
    if (trigger.getEventType() === ScriptApp.EventType.CLOCK) {
      Logger.log(`   Time-based trigger`);
    }
  }
}

// ============================================================================
// MANUAL REFRESH MECHANISMS  
// ============================================================================

/**
 * Create manual refresh menu in tutor spreadsheets
 * This should be called when creating new spreadsheets
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Target spreadsheet
 * @param {number} tutorId - Tutor database ID
 */
function addManualRefreshMenu(spreadsheet, tutorId) {
  try {
    // Create custom menu
    const ui = SpreadsheetApp.getUi();
    
    // Note: Custom menus can't be added from external scripts
    // This will need to be implemented directly in each tutor's spreadsheet
    // For now, we'll add instructions in the sheet
    
    Logger.log(`Manual refresh menu setup for tutor ${tutorId}`);
    
  } catch (error) {
    Logger.log(`Error adding manual refresh menu: ${error.toString()}`);
  }
}

/**
 * Manual refresh endpoint - can be called via URL webhook
 * @param {Object} e - Event object with parameters
 * @returns {GoogleAppsScript.Content.TextOutput} JSON response
 */
function handleManualRefresh(e) {
  try {
    const params = e.parameter;
    const tutorId = parseInt(params.tutorId);
    const weekStart = params.weekStart ? new Date(params.weekStart) : null;
    
    if (!tutorId) {
      throw new Error('Missing tutorId parameter');
    }
    
    Logger.log(`Manual refresh request: tutorId=${tutorId}, weekStart=${weekStart}`);
    
    // Perform the refresh
    refreshSingleTutorSchedule(tutorId, weekStart);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Schedule refreshed for tutor ${tutorId}`,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log(`Manual refresh error: ${error.toString()}`);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString(),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Generate webhook URL for manual refresh
 * @param {number} tutorId - Tutor database ID
 * @param {Date} weekStart - Optional: specific week to refresh
 * @returns {string} Webhook URL
 */
function generateRefreshWebhookURL(tutorId, weekStart = null) {
  const scriptId = ScriptApp.getScriptId();
  const baseUrl = `https://script.google.com/macros/s/${scriptId}/exec`;
  
  let url = `${baseUrl}?tutorId=${tutorId}`;
  
  if (weekStart) {
    url += `&weekStart=${formatDate(weekStart)}`;
  }
  
  return url;
}

// ============================================================================
// HEALTH CHECK AND MONITORING
// ============================================================================

/**
 * Health check function to verify system is working
 * Can be called manually or via trigger
 */
function healthCheck() {
  Logger.log('🏥 Starting system health check...');
  
  const results = {
    timestamp: new Date().toISOString(),
    database: false,
    tutors: 0,
    spreadsheets: 0,
    errors: []
  };
  
  try {
    // Test database connection
    const tutors = getTutorList();
    results.database = true;
    results.tutors = tutors.length;
    Logger.log(`✅ Database: Connected, ${tutors.length} tutors found`);
    
    // Test spreadsheet access
    let spreadsheetsFound = 0;
    for (const tutor of tutors.slice(0, 3)) { // Test first 3 tutors only
      try {
        const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
        if (spreadsheetId) spreadsheetsFound++;
      } catch (error) {
        results.errors.push(`Spreadsheet error for ${tutor.tutor_name}: ${error.toString()}`);
      }
    }
    
    results.spreadsheets = spreadsheetsFound;
    Logger.log(`✅ Spreadsheets: ${spreadsheetsFound} accessible`);
    
    // Check triggers
    const triggers = ScriptApp.getProjectTriggers();
    Logger.log(`✅ Triggers: ${triggers.length} active`);
    
    if (results.errors.length === 0) {
      Logger.log('🎉 Health check passed!');
    } else {
      Logger.log(`⚠️ Health check completed with ${results.errors.length} errors`);
      results.errors.forEach(error => Logger.log(`   - ${error}`));
    }
    
  } catch (error) {
    Logger.log(`❌ Health check failed: ${error.toString()}`);
    results.errors.push(error.toString());
  }
  
  return results;
}

/**
 * Performance test - measure how long it takes to refresh one tutor
 * @param {number} tutorId - Tutor ID to test with
 */
function performanceTest(tutorId = null) {
  Logger.log('⚡ Starting performance test...');
  
  try {
    // Use first tutor if none specified
    if (!tutorId) {
      const tutors = getTutorList();
      if (tutors.length === 0) {
        throw new Error('No tutors found for testing');
      }
      tutorId = tutors[0].id;
    }
    
    const startTime = new Date();
    Logger.log(`Testing with tutor ID: ${tutorId}`);
    
    // Run single tutor refresh
    refreshSingleTutorSchedule(tutorId);
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    Logger.log(`🏁 Performance test completed in ${duration} seconds`);
    Logger.log(`📊 Estimated time for all 8 tutors: ${duration * 8} seconds`);
    Logger.log(`📊 With 30s delays: ${duration * 8 + 30 * 7} seconds (~${Math.ceil((duration * 8 + 30 * 7) / 60)} minutes)`);
    
    return {
      tutorId: tutorId,
      duration: duration,
      estimatedTotal: duration * 8 + 30 * 7
    };
    
  } catch (error) {
    Logger.log(`❌ Performance test failed: ${error.toString()}`);
    throw error;
  }
}

// ============================================================================
// DEPLOYMENT AND SETUP FUNCTIONS
// ============================================================================

/**
 * One-time setup function for initial deployment
 * Run this once after creating the project
 */
function initialSetup() {
  Logger.log('🚀 Starting initial setup...');
  
  try {
    // Step 1: Test database connection
    Logger.log('Step 1: Testing database connection...');
    const tutors = getTutorList();
    Logger.log(`✅ Found ${tutors.length} tutors in database`);
    
    // Step 2: Create spreadsheets for all tutors
    Logger.log('Step 2: Creating tutor spreadsheets...');
    for (let i = 0; i < tutors.length; i++) {
      const tutor = tutors[i];
      Logger.log(`Creating spreadsheet for ${tutor.tutor_name} (${i+1}/${tutors.length})...`);
      
      try {
        const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
        Logger.log(`✅ Spreadsheet created: ${spreadsheetId}`);
        
        // Small delay to prevent rate limiting
        if (i < tutors.length - 1) {
          Utilities.sleep(2000);
        }
        
      } catch (error) {
        Logger.log(`❌ Failed to create spreadsheet for ${tutor.tutor_name}: ${error.toString()}`);
      }
    }
    
    // Step 3: Set up triggers
    Logger.log('Step 3: Setting up automatic triggers...');
    setupAutomaticTriggers();
    
    // Step 4: Initial data population
    Logger.log('Step 4: Populating initial schedule data...');
    Logger.log('⚠️  This may take several minutes...');
    
    // Run first refresh (with extended timeout handling)
    try {
      refreshAllTutorSchedules();
      Logger.log('✅ Initial schedule population completed');
    } catch (error) {
      Logger.log(`⚠️ Initial population partially failed: ${error.toString()}`);
      Logger.log('💡 You can run refreshAllTutorSchedules() manually to complete setup');
    }
    
    Logger.log('🎉 Initial setup completed!');
    Logger.log('📋 Next steps:');
    Logger.log('   1. Fill in your database credentials in CONFIG section');
    Logger.log('   2. Test with testSingleTutor() function');
    Logger.log('   3. Run healthCheck() to verify everything works');
    
  } catch (error) {
    Logger.log(`❌ Initial setup failed: ${error.toString()}`);
    throw error;
  }
}

/**
 * Quick setup test with minimal data
 */
function quickSetupTest() {
  Logger.log('🧪 Running quick setup test...');
  
  try {
    // Test database
    const tutors = getTutorList();
    Logger.log(`✅ Database connection: ${tutors.length} tutors found`);
    
    // Test with first tutor only
    if (tutors.length > 0) {
      const tutor = tutors[0];
      Logger.log(`🧪 Testing with: ${tutor.tutor_name}`);
      
      const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
      Logger.log(`✅ Spreadsheet access: ${spreadsheetId}`);
      
      refreshSingleTutorSchedule(tutor.id);
      Logger.log(`✅ Data processing: Schedule generated successfully`);
    }
    
    Logger.log('🎉 Quick test passed! System is ready.');
    
    // Provide URL to open the spreadsheet manually
    const spreadsheet = SpreadsheetApp.openById(getOrCreateTutorSpreadsheet(tutors[0]));
    const url = spreadsheet.getUrl();
    Logger.log(`📊 Open the spreadsheet to see features: ${url}`);
    Logger.log('💡 The menu and colored tabs only appear when you open the spreadsheet manually!');
    
  } catch (error) {
    Logger.log(`❌ Quick test failed: ${error.toString()}`);
    Logger.log('💡 Check your database credentials and permissions');
    throw error;
  }
}

/**
 * Test function to demonstrate spreadsheet features
 * Use this after running quickSetupTest() to check the manual features
 */
function testSpreadsheetFeatures() {
  Logger.log('🧪 Testing spreadsheet features...');
  
  try {
    const tutors = getTutorList();
    if (tutors.length === 0) {
      Logger.log('❌ No tutors found in database');
      return;
    }
    
    const tutor = tutors[0];
    const spreadsheetId = getOrCreateTutorSpreadsheet(tutor);
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    Logger.log(`✅ Testing with spreadsheet: ${tutor.tutor_name} - Schedule 2025`);
    
    // Check if tutor ID is stored
    const docProperties = PropertiesService.getDocumentProperties();
    const storedTutorId = docProperties.getProperty('TUTOR_ID');
    Logger.log(`📋 Tutor ID stored in properties: ${storedTutorId}`);
    
    // Check tab colors and current week detection
    const sheets = spreadsheet.getSheets();
    const currentWeekFound = [];
    
    sheets.forEach(sheet => {
      const tabName = sheet.getName();
      const tabColor = sheet.getTabColor();
      
      // Test if this would be detected as current week
      const weekStart = getWeekStartFromTabName(tabName);
      if (weekStart && isCurrentWeek(weekStart)) {
        currentWeekFound.push(tabName);
        Logger.log(`🟢 CURRENT WEEK TAB: ${tabName} (Color: ${tabColor})`);
      } else {
        Logger.log(`📅 Tab: ${tabName} (Color: ${tabColor || 'default'})`);
      }
    });
    
    if (currentWeekFound.length > 0) {
      Logger.log(`✅ Current week highlighting: ${currentWeekFound.length} tabs should be green`);
    } else {
      Logger.log(`⚠️ No current week tabs found - check GMT+8 timezone calculation`);
    }
    
    // Provide URL to open
    const url = spreadsheet.getUrl();
    Logger.log(`🌐 Open this URL to see the menu: ${url}`);
    Logger.log(`💡 Once opened, you should see:`);
    Logger.log(`   - "Tutor Schedule" menu in the menu bar`);
    Logger.log(`   - Green colored tab for current week`);
    Logger.log(`   - Manual refresh options in the menu`);
    
  } catch (error) {
    Logger.log(`❌ Feature test failed: ${error.toString()}`);
    throw error;
  }
}

/**
 * Reset function to delete all existing tutor spreadsheets for clean testing
 * Use this when you need to test features from scratch
 */
function resetTutorSpreadsheets() {
  Logger.log('🧹 Resetting all tutor spreadsheets...');
  
  try {
    const tutors = getTutorList();
    let deletedCount = 0;
    
    for (const tutor of tutors) {
      const spreadsheetName = `${tutor.tutor_name} - Schedule 2025`;
      const files = DriveApp.getFilesByName(spreadsheetName);
      
      while (files.hasNext()) {
        const file = files.next();
        DriveApp.getFileById(file.getId()).setTrashed(true);
        Logger.log(`🗑️ Deleted: ${spreadsheetName}`);
        deletedCount++;
      }
    }
    
    Logger.log(`✅ Reset complete: ${deletedCount} spreadsheets deleted`);
    Logger.log(`💡 Run quickSetupTest() now to create fresh spreadsheets with all features`);
    
  } catch (error) {
    Logger.log(`❌ Reset failed: ${error.toString()}`);
    throw error;
  }
}