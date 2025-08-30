# Automated Tutor Schedule System

## 🎯 Project Overview

**Purpose**: Migrate from rigid Google Sheets formulas to a flexible, automated tutor schedule system that pulls data from MySQL database and generates clean, visual weekly schedules for each tutor.

**Timeline**: 1-2 weeks development
**Priority**: Urgent - replacing current summer course schedule system

---

## 🏗️ System Architecture

### **Core Components**

1. **TutorScheduleManager** (Separate Apps Script Project)
   - Database connectivity via JDBC to MySQL
   - Schedule generation and formatting logic
   - Time-driven triggers for automatic updates
   - Manual refresh endpoints

2. **Individual Tutor Spreadsheets** 
   - Format: `[Tutor Name] - Schedule 2025`
   - Structure: Weekly tabs (current week + 2 weeks ahead)
   - Location: Shared with respective tutors

3. **Database Integration**
   - Primary tables: `session_log`, `students`, `tutors`, `enrollments`
   - Query optimization for 8 tutors with minimal API calls

---

## 📋 Technical Specifications

### **Data Flow**
```
MySQL Database → Apps Script → Individual Tutor Spreadsheets
    ↓               ↓                    ↓
session_log    Query & Format      Weekly Tab Updates
students       Status Mapping      Conditional Formatting  
tutors         Grade Detection     Manual Refresh Buttons
enrollments    Layout Engine       Current Week Highlighting
```

### **Schedule Layout** 
- **Header Structure**: 
  - Row 1: "Class Schedule" title with year (2025) in merged U1:V2 cell
  - Row 2: Tutor name (starting from column B)
  - Row 3: Dates in "Sep 03" format (light grey background)
  - Row 4: Day names Sunday-Saturday (dark grey background)
- **Column Structure**: Time | Sunday(Name|L|A) | Monday(Name|L|A) | ... | Saturday(Name|L|A)
- **Student Format**: `[school_student_id] [student_name] [grade][langstream] [school]`
- **Status Columns**: 
  - L: Lesson Status (`R`|`M`|`S`|`?`|`T`)
  - A: Attendance Status (`✓`|`X`)
- **Visual Features**:
  - Class grade colors (8 specific colors for F1C-F4E combinations)
  - Grey spacer rows between time slots (23px height)
  - Frozen time column and header rows for navigation
  - Student sorting by majority grade/stream, then by student ID

---

## 🔄 Update Mechanisms

### **Automatic Refresh**
- **Schedule**: Daily at 00:00 and 14:00 (midnight + lunch time)
- **Scope**: All 8 tutors processed sequentially
- **Performance**: ~15 minutes total processing time
- **Error Handling**: Continue processing other tutors if one fails

### **Manual Refresh**
- **Trigger**: Button in each spreadsheet tab
- **Scope**: Single tutor, single week tab only
- **Purpose**: Tutors can refresh their own current week schedule
- **Implementation**: Custom menu button calls webhook

### **Tab Management**
- **Auto-create**: New weekly tabs as weeks progress
- **Highlighting**: Current week tab colored green
- **Cleanup**: Archive tabs older than 4 weeks

---

## 📊 Database Queries

### **Main Schedule Query**
```sql
SELECT 
    sl.session_date,
    sl.time_slot,
    sl.location,
    sl.session_status,
    sl.attendance_marked_by,
    s.school_student_id,
    s.student_name,
    s.grade,
    s.lang_stream,
    s.school,
    t.tutor_name
FROM session_log sl
JOIN students s ON sl.student_id = s.id
JOIN tutors t ON sl.tutor_id = t.id
WHERE t.id = ? 
  AND sl.session_date BETWEEN ? AND ?
ORDER BY sl.session_date, sl.time_slot, s.student_name
```

### **Grade Detection Logic**
```javascript
function determineClassGrade(sessions) {
    // Count grades from non-makeup students
    const gradeCount = {};
    const streamCount = {};
    
    sessions
        .filter(s => !s.session_status.includes('Make-up'))
        .forEach(s => {
            gradeCount[s.grade] = (gradeCount[s.grade] || 0) + 1;
            streamCount[s.lang_stream] = (streamCount[s.lang_stream] || 0) + 1;
        });
    
    const majorityGrade = Object.keys(gradeCount).reduce((a, b) => 
        gradeCount[a] > gradeCount[b] ? a : b);
    const majorityStream = Object.keys(streamCount).reduce((a, b) => 
        streamCount[a] > streamCount[b] ? a : b);
        
    return `${majorityGrade} ${majorityStream}`;
}
```

---

## 🎨 Status Mapping System

### **Lesson Status (Left Box)**
| Database Value | Display | Color |
|---|---|---|
| `Scheduled` | ` ` | Default |
| `Rescheduled - Pending Make-up` | `R` | Yellow + Strikethrough |
| `Rescheduled - Make-up Booked` | `R` | Yellow |
| `Make-up Class` | `M` | Yellow |
| `Sick Leave - Pending Make-up` | `S` | Orange |
| `Sick Leave - Make-up Booked` | `S` | Orange |
| `To be Confirmed` | `?` | Gray |
| `Trial Class` | `T` | Blue |

### **Attendance Status (Right Box)**
| Condition | Display | Logic |
|---|---|---|
| Attended | `✓` | `session_status` contains "Attended" |
| No Show | `X` | `session_status` = "No Show" + Strikethrough |
| Not Yet | ` ` | Future sessions or unmarked |

### **Conditional Formatting Rules**
- **Strikethrough Text**: When status contains "Rescheduled" or "No Show"
- **Row Highlighting**: Different colors per location/class type
- **Current Week Tab**: Green background color

---

## ⚡ Performance Optimization

### **Batch Processing Strategy**
```javascript
function refreshAllTutorSchedules() {
    const tutors = getTutorList();
    
    for (let i = 0; i < tutors.length; i++) {
        try {
            Logger.log(`Processing tutor ${i+1}/${tutors.length}: ${tutors[i].name}`);
            refreshSingleTutorSchedule(tutors[i].id);
            
            // Prevent timeout with 30-second delay between tutors
            if (i < tutors.length - 1) {
                Utilities.sleep(30000);
            }
        } catch (error) {
            Logger.log(`Error processing ${tutors[i].name}: ${error}`);
            // Continue with next tutor
        }
    }
}
```

### **Spreadsheet Optimization**
- Use `setValues()` for batch cell updates instead of `setValue()`
- Cache spreadsheet objects to avoid repeated API calls  
- Update only changed cells using diff comparison
- Group formatting operations together

### **Database Optimization**
- Single query per tutor per week using date range
- Index on `(tutor_id, session_date)` for fast lookups
- Connection reuse across multiple queries
- Prepared statements for repeated queries

---

## 📅 Development Plan

### **Phase 1: Core Data Engine** ✅ COMPLETED
- [x] Set up TutorScheduleManager Apps Script project
- [x] Implement database connection and timezone-aware queries
- [x] Create `refreshSingleTutorSchedule()` and `refreshAllTutorSchedules()` functions  
- [x] Test with tutor data and fix timezone issues

### **Phase 2: Layout & Formatting** ✅ COMPLETED  
- [x] Implement exact screenshot layout system with 22-column structure
- [x] Build status mapping and conditional formatting with 8 class grade colors
- [x] Create weekly tab management system with proper headers
- [x] Perfect border structure and visual formatting matching screenshot
- [x] Student sorting by majority grade/stream then by student ID

### **Phase 3: Automation & Polish** 🔄 IN PROGRESS
- [x] Set up time-driven triggers (daily at 00:00 and 14:00)
- [x] Implement comprehensive setup and testing functions
- [x] Add health check and performance monitoring
- [x] Complete deployment package with setup guide
- [ ] Manual refresh buttons (pending future enhancement)
- [ ] Add current week highlighting
- [ ] Performance testing with all 8 tutors

### **Phase 4: Deployment** ⏳ READY FOR DEPLOYMENT
- [x] Complete system testing and bug fixes
- [x] Documentation and setup guide creation
- [x] All core features implemented and working
- [ ] Production deployment (pending user approval)
- [ ] Tutor training and rollout

---

## 🚀 Current Status: READY FOR DEPLOYMENT

The TutorScheduleManager system is **fully functional** and ready for production use:

- ✅ **Core Engine**: MySQL integration with timezone handling
- ✅ **Layout System**: Perfect screenshot-matching visual format  
- ✅ **Automation**: Daily triggers and comprehensive testing functions
- ✅ **Documentation**: Complete setup guide and troubleshooting
- ✅ **Deployment Package**: Ready in `/deployment` folder

**Next Steps**: Run deployment when ready to replace current schedule system.
- [ ] Create spreadsheet files for all tutors
- [ ] Deploy and test in production
- [ ] Document usage instructions for tutors
- [ ] Monitor and fix any issues

---

## 🛠️ Technical Implementation

### **Main Functions Structure**
```javascript
// Core Functions
function refreshAllTutorSchedules()           // Time trigger entry point
function refreshSingleTutorSchedule(tutorId) // Manual refresh entry point  
function generateWeeklySchedule(tutorId, weekStart, weekEnd)
function updateScheduleTab(spreadsheetId, tabName, scheduleData)

// Helper Functions  
function getTutorSpreadsheetId(tutorId)
function createWeeklyTab(spreadsheetId, weekStart)
function formatScheduleData(rawSessions)
function applyConditionalFormatting(sheet, data)
function addManualRefreshButton(sheet, tutorId, weekStart)

// Database Functions
function connectToDatabase()
function getSessionsForTutorWeek(tutorId, startDate, endDate)  
function getTutorList()
function getStudentDetails(studentIds)
```

### **Spreadsheet Template Structure**
```
Tab Name: "Week of Mar 3, 2025" (current week = green)
         A    B    C    D    E    F    G    H
    1    |    | Mon | Tue | Wed | Thu | Fri | Sat | Sun
    2    |    | Mar3| Mar4| Mar5| Mar6| Mar7| Mar8| Mar9  
    3    |    | F2E | F1C | F3E |     |     | F1E |     
    4   9:00  |     |     |     |     |     |     |     
    5    |    | 1234 John F2E School | 1567 Mary F1C ABC |
    6    |    | R ✓ | M X |     |     |     |     |     
    7   10:30 |     |     |     |     |     |     |     
    8    |    |     |     |     |     |     |     |     
    ...
```

---

## 🚀 Ready to Build

**Next Steps**:
1. Create TutorScheduleManager Apps Script project
2. Set up database connection 
3. Build and test core scheduling functions
4. Create first tutor spreadsheet for testing

**Success Criteria**:
- ✅ All 8 tutors have individual spreadsheet files
- ✅ Weekly tabs auto-generated with current + 2 weeks ahead  
- ✅ Automatic refresh twice daily without timeout
- ✅ Manual refresh button works for individual weeks
- ✅ Visual format matches current schedule quality
- ✅ Dynamic layout handles varying student counts
- ✅ Status indicators and formatting work correctly

---

*This system will replace the rigid formula-based approach with a flexible, maintainable solution that scales with the business needs.*