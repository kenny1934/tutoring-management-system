# Tutor Schedule Manager - Setup Guide

## ✨ Features
- **Automatic Schedule Generation**: Creates weekly schedule tabs for all tutors
- **Current Week Highlighting**: Green tab color indicates current week (GMT+8 timezone)
- **Manual Refresh Menu**: Built-in menu for manual schedule updates
- **Performance Optimized**: Only refreshes current and future weeks, skips past weeks
- **Enhanced Error Handling**: Robust file validation prevents duplicate spreadsheets
- **Smart Tab Sorting**: Chronological tab ordering (0831-0906, 0907-0913, etc.)
- **Instructions Sheet**: Built-in usage guide for tutors
- **RDO & Holiday Support**: Automatically greys out regular days off and holidays
- **Auto-Navigation**: Opens to current week tab automatically

## 🎯 Quick Start (5 minutes)

### **Step 1: Create Apps Script Project**
1. Go to [script.google.com](https://script.google.com)
2. Create a new project named "TutorScheduleManager"
3. Copy all `.gs` files from this folder into the project:
   - `Code.gs` (main functions)
   - `SpreadsheetManager.gs` (spreadsheet handling)
   - `DataProcessor.gs` (data formatting)
   - `TriggerSetup.gs` (automation)

### **Step 2: Configure Database Connection**
1. Open `Code.gs` in the Apps Script editor
2. Find the `CONFIG` section at the top
3. Fill in your database credentials:
   ```javascript
   const CONFIG = {
     DB_CONNECTION_STRING: "jdbc:google:mysql://your-instance/csm_db",
     DB_USERNAME: "your-username",
     DB_PASSWORD: "your-password",
     // ... other settings
   };
   ```

### **Step 3: Test Connection**
1. In Apps Script editor, select function `quickSetupTest`
2. Click "Run" button
3. Authorize permissions when prompted
4. Check execution log for results
5. Should see: "🎉 Quick test passed! System is ready."

### **Step 4: Deploy as Library**
1. In Apps Script editor, go to **Project Settings**
2. Copy the **Script ID** (save this for later)
3. Click **Deploy > New Deployment**
4. Choose type: **Library**
5. Add description: "TutorScheduleManager Library"
6. Click **Deploy** and copy the deployment ID

### **Step 5: Full Deployment**
1. Run function `initialSetup` 
2. Wait 10-15 minutes for complete setup
3. Check execution logs for progress
4. Verify tutor spreadsheets were created in Google Drive

### **Step 6: Enable Individual Spreadsheet Menus**
For each tutor spreadsheet to have its own refresh menu:
1. Open the tutor spreadsheet
2. Go to **Extensions > Apps Script**
3. Replace default code with `BoundScriptTemplate.gs` content
4. Add library: Click **Libraries (+)** in sidebar
5. Enter your **Script ID** from Step 4
6. Set identifier to: `TutorScheduleManager`
7. Select latest version and **Save**
8. Refresh the spreadsheet - "📅 Tutor Schedule" menu should appear

---

## 🔧 Configuration Options

### **Database Settings**
```javascript
// In CONFIG section of Code.gs
DB_CONNECTION_STRING: "jdbc:google:mysql://instance/database",
DB_USERNAME: "username",
DB_PASSWORD: "password",
```

### **Schedule Settings**
```javascript
WEEKS_AHEAD: 2,              // Current week + 2 weeks ahead
WEEKS_TO_KEEP: 8,            // Keep this many weeks of past schedules visible
SKIP_PAST_WEEKS: true,       // Skip refreshing past weeks for better performance
MAX_STUDENTS_PER_SLOT: 12,   // Max rows per time slot
MIN_ROWS_PER_SLOT: 5,        // Min rows even if empty
DELAY_BETWEEN_TUTORS: 30000, // 30 seconds between tutors
```

### **Timing Settings**
- **Automatic refresh**: Daily at 00:00 and 14:00
- **Manual refresh**: Via spreadsheet button or webhook
- **Performance**: ~15 minutes to refresh all 8 tutors

---

## 🧪 Testing Functions

### **Basic Tests**
```javascript
quickSetupTest()      // Fast connection test
testDatabaseConnection() // Database only
testGetTutors()       // List all tutors
testSingleTutor()     // Process one tutor
```

### **Advanced Tests** 
```javascript
healthCheck()         // Full system health check
performanceTest()     // Measure processing speed
testDataProcessing()  // Test data formatting
```

### **Trigger Management**
```javascript
setupAutomaticTriggers()  // Install daily triggers
deleteAllTriggers()       // Remove all triggers
listCurrentTriggers()     // View active triggers
```

---

## 📊 Expected Output

### **Tutor Spreadsheets**
- **File name**: `[Tutor Name] Regular Schedule 2025-2026`
- **Tabs**: Weekly tabs (current week highlighted in green)
- **Features**: Manual refresh menu, instructions sheet, chronological tab sorting
- **Format**: Time slots with student lists, status indicators
- **Sharing**: Auto-shared with respective tutor's email

### **Schedule Format**
```
         Mon    Tue    Wed    Thu    Fri    Sat    Sun
         Mar 3  Mar 4  Mar 5  Mar 6  Mar 7  Mar 8  Mar 9
         F2 E   F1 C   F3 E                F1 E

10:00    1234 John Doe F2E ABC School
         R ✓   
         
         5678 Jane Smith F1C XYZ School  
         M X
```

### **Status Indicators**
- **Left box**: `R`(Rescheduled) `M`(Make-up) `S`(Sick) `T`(Trial) `?`(TBC)
- **Right box**: `✓`(Attended) `X`(No Show)
- **Formatting**: Strikethrough for rescheduled/no-show

---

## 🚀 Deployment Checklist

### **Pre-deployment**
- [ ] Database credentials configured
- [ ] Apps Script permissions authorized
- [ ] `quickSetupTest()` passes successfully
- [ ] All 8 tutors visible in `testGetTutors()`

### **Deployment**
- [ ] Run `initialSetup()` function
- [ ] Wait for completion (10-15 minutes)
- [ ] Check Google Drive for tutor spreadsheets
- [ ] Verify automatic triggers are installed
- [ ] Run `healthCheck()` to confirm everything works

### **Post-deployment**
- [ ] Share spreadsheet links with tutors
- [ ] Test manual refresh functionality
- [ ] Monitor first automatic refresh cycle
- [ ] Document any issues or customizations needed

---

## 🔧 Troubleshooting

### **Common Issues**

**"Database connection failed"**
- Check database credentials in CONFIG
- Verify Cloud SQL instance is running
- Confirm database user has proper permissions

**"Permission denied"**
- Re-authorize Apps Script permissions
- Check Google Drive sharing settings
- Verify tutor email addresses are correct

**"Timeout error"**
- Normal for initial setup with 8 tutors
- Try `refreshSingleTutorSchedule(1)` for individual testing
- Increase delay between tutors if needed

**"No sessions found"**
- Verify session_log table has data
- Check date ranges (system looks at current + 2 weeks)
- Confirm tutor IDs match between database and spreadsheets

### **Performance Issues**

**Slow execution**
- Normal processing time: ~30 seconds per tutor (with optimizations)
- Total time for all tutors: ~5 minutes
- The system now skips refreshing past weeks automatically
- Only current and future weeks are updated to save time
- Use `performanceTest()` to measure actual speeds

**Memory errors**
- Reduce `WEEKS_AHEAD` from 2 to 1
- Process fewer tutors per batch
- Clear old spreadsheet tabs manually

---

## 📞 Manual Operations

### **Refresh Single Tutor**
```javascript
// Refresh tutor ID 1 for all weeks
refreshSingleTutorSchedule(1);

// Refresh specific week only
refreshSingleTutorSchedule(1, '2025-09-01');
```

### **Create New Tutor Spreadsheet**
```javascript
const tutor = getTutorById(5);
getOrCreateTutorSpreadsheet(tutor);
```

### **Regenerate All Schedules**
```javascript
// Full refresh (will take 15+ minutes)
refreshAllTutorSchedules();
```

---

## 📈 Monitoring and Maintenance

### **Weekly Tasks**
- Run `healthCheck()` to verify system status
- Check execution logs for errors
- Verify new weekly tabs are created automatically

### **Monthly Tasks**
- Archive old spreadsheet tabs (older than 4 weeks)
- Review performance metrics
- Update tutor list if staff changes

### **As Needed**
- Update database credentials if changed
- Modify time slots if schedule format changes
- Add new tutors by running `initialSetup()` again

---

## 🎯 Success Metrics

**System Working Properly**:
- ✅ All 8 tutors have individual spreadsheets
- ✅ Weekly tabs auto-generated (current + 2 weeks ahead)
- ✅ Automatic refresh twice daily without errors
- ✅ Manual refresh works for individual weeks
- ✅ Status indicators display correctly
- ✅ Student information formatted properly
- ✅ Current week tab highlighted in green

**Performance Benchmarks**:
- Single tutor refresh: < 3 minutes
- All tutors refresh: < 20 minutes
- Database query time: < 30 seconds
- Spreadsheet update time: < 2 minutes per tutor

---

🚀 **Ready to deploy? Start with Step 1!**