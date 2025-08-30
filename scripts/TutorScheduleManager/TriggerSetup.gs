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
    
  } catch (error) {
    Logger.log(`❌ Quick test failed: ${error.toString()}`);
    Logger.log('💡 Check your database credentials and permissions');
    throw error;
  }
}