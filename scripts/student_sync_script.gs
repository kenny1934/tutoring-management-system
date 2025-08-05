function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('CSM Admin Tools')
      .addItem('🔄️Refresh Student List from Database', 'refreshStudentList')
      .addToUi();
}

function refreshStudentList() {
  // --- Database connection details ---
  const instanceConnectionName = "csm-database-project:asia-east2:csm-regular-course-db";
  const dbName = "csm_db";
  const username = "AppSheet";
  const password = "PASSWORD";
  // -----------------------------------------

  const connectionString = `jdbc:google:mysql://${instanceConnectionName}/${dbName}`;
  
  try {
    Logger.log("Attempting to connect to database...");
    Logger.log("Connection string: " + connectionString);
    
    const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
    Logger.log("Database connection successful!");
    
    const stmt = conn.createStatement();
    const results = stmt.executeQuery("SELECT * FROM students ORDER BY student_name");
    Logger.log("Query executed successfully!");
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Consolidated_Student_List");
    
    if (!sheet) {
      throw new Error("Consolidated_Student_List sheet not found!");
    }
    
    // Clear existing data (but keep headers)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
    
    // Write new data
    const numCols = results.getMetaData().getColumnCount();
    const data = [];
    let rowCount = 0;
    
    while (results.next()) {
      const row = [];
      for (let col = 0; col < numCols; col++) {
        const value = results.getString(col + 1);
        row.push(value ? value.toString().trim() : "");
      }
      data.push(row);
      rowCount++;
    }
    
    Logger.log(`Retrieved ${rowCount} student records`);
    
    if (data.length > 0) {
      sheet.getRange(2, 1, data.length, numCols).setValues(data);
      Logger.log("Data written to sheet successfully!");
    }
    
    results.close();
    stmt.close();
    conn.close();
    
    // Show success message
    SpreadsheetApp.getUi().alert(
      'Success!', 
      `Student list refreshed successfully!\n${rowCount} records updated.`, 
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
  } catch (err) {
    Logger.log("Error details: " + err.toString());
    Logger.log("Error stack: " + err.stack);
    
    // Show user-friendly error
    SpreadsheetApp.getUi().alert(
      'Database Connection Failed', 
      `Failed to refresh student list.\n\nError: ${err.message}\n\nPlease check:\n1. Cloud SQL instance is running\n2. Database credentials are correct\n3. Network permissions are set`, 
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    throw err;
  }
}

// Test function to check database connectivity
function testDatabaseConnection() {
  const instanceConnectionName = "csm-database-project:asia-east2:csm-regular-course-db";
  const dbName = "csm_db";
  const username = "AppSheet";
  const password = "PASSWORD";
  
  const connectionString = `jdbc:google:mysql://${instanceConnectionName}/${dbName}`;
  
  try {
    Logger.log("Testing database connection...");
    const conn = Jdbc.getCloudSqlConnection(connectionString, username, password);
    Logger.log("✅ Connection successful!");
    
    const stmt = conn.createStatement();
    const results = stmt.executeQuery("SELECT COUNT(*) as student_count FROM students");
    
    if (results.next()) {
      const count = results.getInt(1);
      Logger.log(`✅ Found ${count} students in database`);
    }
    
    results.close();
    stmt.close();
    conn.close();
    
    return "Connection test passed!";
    
  } catch (err) {
    Logger.log("❌ Connection failed: " + err.toString());
    return "Connection test failed: " + err.message;
  }
}