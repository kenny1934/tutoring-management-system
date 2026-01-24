# Lowcoder Pilot Setup Guide

A step-by-step guide to set up Lowcoder on your local PC and build a dashboard + session list for the tutoring management system.

## Prerequisites

- Windows PC with 8GB+ RAM
- WSL2 enabled (you already have this)
- Internet connection
- Access to Google Cloud Console (for Cloud SQL IP whitelisting)

---

## Step 1: Install Docker Desktop

### 1.1 Download Docker Desktop
1. Go to https://docs.docker.com/desktop/install/windows-install/
2. Download "Docker Desktop for Windows"
3. Run the installer

### 1.2 Configure Docker Desktop
1. During installation, ensure "Use WSL 2 instead of Hyper-V" is checked
2. After installation, restart your computer
3. Open Docker Desktop and complete the setup wizard
4. In Settings > Resources > WSL Integration, enable integration with your WSL distro

### 1.3 Verify Installation
Open WSL terminal and run:
```bash
docker --version
# Should show: Docker version 20.10.x or higher

docker-compose --version
# Should show: Docker Compose version v2.x.x or higher
```

---

## Step 2: Deploy Lowcoder

### 2.1 Create Lowcoder Directory
```bash
mkdir ~/lowcoder
cd ~/lowcoder
```

### 2.2 Download Docker Compose File
```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/lowcoder-org/lowcoder/main/deploy/docker/docker-compose.yml
```

### 2.3 Start Lowcoder
```bash
docker-compose up -d
```

First run will download ~400MB image. Wait for it to complete.

### 2.4 Verify Lowcoder is Running
```bash
docker-compose ps
```

Should show the lowcoder container as "Up".

### 2.5 Access Lowcoder
Open browser and go to: **http://localhost:3000**

### 2.6 Create Admin Account
1. Click "Sign Up"
2. Create your admin account with email/password
3. Log in

---

## Step 3: Configure Cloud SQL Access

### 3.1 Find Your Local IP
```bash
curl ifconfig.me
```
Note down this IP address (e.g., `203.0.113.42`)

### 3.2 Whitelist IP in Cloud SQL
1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Navigate to: SQL > Your Instance > Connections
3. Click "Add Network" under "Authorized networks"
4. Enter:
   - Name: `Local Dev`
   - Network: Your IP from step 3.1 (e.g., `203.0.113.42`)
5. Click "Done" then "Save"

**Note:** If your ISP assigns dynamic IPs, you may need to update this periodically.

---

## Step 4: Connect Lowcoder to MySQL

### 4.1 Add MySQL Data Source
1. In Lowcoder, go to **Settings** (gear icon) > **Data Sources**
2. Click **+ New Data Source**
3. Select **MySQL**

### 4.2 Configure Connection
Fill in these details:
- **Name:** `TutoringDB` (or any name)
- **Host:** Your Cloud SQL public IP
- **Port:** `3306`
- **Database Name:** Your database name (check your .env or config)
- **User Name:** Your database username
- **Password:** Your database password

### 4.3 Test Connection
Click **Test Connection** to verify. If successful, click **Save**.

---

## Step 5: Build the Dashboard

### 5.1 Create New App
1. Click **+ Create New** > **App**
2. Name it: `Tutoring Dashboard`

### 5.2 Add Metric Queries

**Query 1: Active Students**
1. Click **+ New** in the Query panel
2. Select your MySQL data source
3. Name: `activeStudents`
4. Query:
```sql
SELECT COUNT(DISTINCT student_id) as count FROM latest_enrollments
```
5. Click **Run** to test

**Query 2: Active Enrollments**
- Name: `activeEnrollments`
```sql
SELECT COUNT(*) as count FROM enrollments
WHERE payment_status IN ('Paid', 'Pending Payment')
```

**Query 3: Pending Payments**
- Name: `pendingPayments`
```sql
SELECT COUNT(*) as count FROM enrollments
WHERE payment_status = 'Pending Payment'
```

**Query 4: Sessions This Month**
- Name: `sessionsThisMonth`
```sql
SELECT COUNT(*) as count FROM session_log
WHERE YEAR(session_date) = YEAR(CURDATE())
AND MONTH(session_date) = MONTH(CURDATE())
```

**Query 5: Monthly Revenue**
- Name: `monthlyRevenue`
```sql
SELECT tutor_name, total_revenue, sessions_count
FROM tutor_monthly_revenue
WHERE session_period = DATE_FORMAT(CURDATE(), '%Y-%m')
ORDER BY total_revenue DESC
```

### 5.3 Add Dashboard Components

**Stat Cards:**
1. Drag **Statistic** component from left panel
2. Set Title: `Active Students`
3. Set Value: `{{activeStudents.data[0].count}}`
4. Repeat for other metrics

**Revenue Table:**
1. Drag **Table** component
2. Set Data: `{{monthlyRevenue.data}}`
3. Configure columns: Tutor Name, Revenue, Sessions

### 5.4 Add Location Filter (Optional)
1. Add **Select** component
2. Query for options:
```sql
SELECT DISTINCT location FROM enrollments ORDER BY location
```
3. Update other queries to filter by `{{locationFilter.value}}`

---

## Step 6: Build Session List

### 6.1 Create New Page
1. In your app, add a new page or section
2. Name: `Sessions`

### 6.2 Add Filter Components

**Date From:**
- Component: **Date Picker**
- Name: `dateFrom`
- Default: First day of current month

**Date To:**
- Component: **Date Picker**
- Name: `dateTo`
- Default: Today

**Tutor Filter:**
- Component: **Select**
- Name: `tutorFilter`
- Options query:
```sql
SELECT id as value, tutor_name as label FROM tutors ORDER BY tutor_name
```

**Status Filter:**
- Component: **Select**
- Name: `statusFilter`
- Manual options: `Scheduled`, `Completed`, `Cancelled`, `Rescheduled`

### 6.3 Add Session Query
Name: `sessions`
```sql
SELECT
    sl.id,
    DATE_FORMAT(sl.session_date, '%Y-%m-%d') as session_date,
    sl.session_status,
    sl.financial_status,
    s.student_name,
    s.grade,
    t.tutor_name,
    e.location
FROM session_log sl
JOIN students s ON sl.student_id = s.id
JOIN tutors t ON sl.tutor_id = t.id
JOIN enrollments e ON sl.enrollment_id = e.id
WHERE sl.session_date >= {{dateFrom.value}}
  AND sl.session_date <= {{dateTo.value}}
  AND ({{tutorFilter.value}} IS NULL OR t.id = {{tutorFilter.value}})
  AND ({{statusFilter.value}} IS NULL OR sl.session_status = {{statusFilter.value}})
ORDER BY sl.session_date DESC
LIMIT 200
```

**Important:** Set this query to run when filter values change:
- In query settings, under "Run query on changes of", add: `dateFrom`, `dateTo`, `tutorFilter`, `statusFilter`

### 6.4 Add Sessions Table
1. Drag **Table** component
2. Set Data: `{{sessions.data}}`
3. Configure columns and formatting
4. Optional: Add status color coding using conditional formatting

---

## Step 7: Test Everything

### Checklist
- [ ] Dashboard loads with correct numbers
- [ ] Numbers match AppSheet/webapp data
- [ ] Date filters update session list
- [ ] Tutor dropdown works
- [ ] Status filter works
- [ ] Performance is acceptable (< 3 seconds)

---

## Troubleshooting

### Can't connect to database
- Verify your IP is whitelisted in Cloud SQL
- Check if your IP changed (run `curl ifconfig.me` again)
- Verify database credentials

### Lowcoder won't start
```bash
cd ~/lowcoder
docker-compose logs
```
Check for error messages.

### Queries timeout
- Add `LIMIT` to queries
- Check if Cloud SQL is under heavy load
- Consider creating indexes if needed

### Container keeps restarting
```bash
docker-compose down
docker-compose up -d
```

---

## Stopping & Restarting Lowcoder

### Stop Lowcoder
```bash
cd ~/lowcoder
docker-compose down
```

### Start Lowcoder
```bash
cd ~/lowcoder
docker-compose up -d
```

### View Logs
```bash
docker-compose logs -f
```

---

## Step 8: Apply Webapp Theme Styling

Your webapp uses a warm "Classroom Skeuomorphism" theme. Here's how to replicate it in Lowcoder.

### 8.1 Color Palette Reference

| Role | Color | Hex |
|------|-------|-----|
| **Background** | Warm cream | `#fef9f3` |
| **Surface/Cards** | White | `#ffffff` |
| **Primary** | Golden Oak | `#a0704b` |
| **Primary Hover** | Lighter Oak | `#cd853f` |
| **Text** | Warm dark brown | `#2a2219` |
| **Muted Text** | Warm gray | `#6b5a4a` |
| **Border** | Warm tan | `#e8d4b8` |
| **Success** | Green | `#16a34a` |
| **Warning** | Orange | `#ea580c` |
| **Destructive** | Red | `#dc2626` |

### 8.2 Lowcoder Theme Settings

In Lowcoder: **Settings > Themes > Create New Theme**

```
Primary Color: #a0704b
Background Color: #fef9f3
Surface Color: #ffffff
Text Color: #2a2219
Border Color: #e8d4b8
Border Radius: 12px
```

### 8.3 Custom CSS

In your Lowcoder app, go to **Settings > Scripts & Styles > CSS** and paste:

```css
/* === TUTORING SYSTEM THEME === */

/* Global Background */
.canvas-container {
  background-color: #fef9f3 !important;
}

/* Typography */
* {
  font-family: Inter, system-ui, -apple-system, sans-serif;
}

/* Cards & Containers */
.container-comp, .card-comp {
  background: #ffffff !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 12px !important;
  box-shadow: 0 1px 3px rgba(160, 112, 75, 0.1) !important;
}

/* Tables */
.ant-table {
  background: #ffffff !important;
  border-radius: 12px !important;
  overflow: hidden;
}

.ant-table-thead > tr > th {
  background: #f5f0e8 !important;
  color: #2a2219 !important;
  font-weight: 600 !important;
  border-bottom: 2px solid #e8d4b8 !important;
}

.ant-table-tbody > tr > td {
  border-bottom: 1px solid #f5e6d3 !important;
}

.ant-table-tbody > tr:hover > td {
  background: #fef9f3 !important;
}

/* Buttons - Primary */
.ant-btn-primary {
  background: #a0704b !important;
  border-color: #a0704b !important;
  border-radius: 8px !important;
}

.ant-btn-primary:hover {
  background: #cd853f !important;
  border-color: #cd853f !important;
}

/* Buttons - Default */
.ant-btn-default {
  border-color: #e8d4b8 !important;
  color: #2a2219 !important;
  border-radius: 8px !important;
}

.ant-btn-default:hover {
  border-color: #a0704b !important;
  color: #a0704b !important;
}

/* Inputs & Selects */
.ant-input, .ant-select-selector, .ant-picker {
  border-color: #e8d4b8 !important;
  border-radius: 8px !important;
}

.ant-input:focus, .ant-input:hover,
.ant-select-focused .ant-select-selector,
.ant-picker:hover {
  border-color: #a0704b !important;
  box-shadow: 0 0 0 2px rgba(160, 112, 75, 0.1) !important;
}

/* Stat Cards */
.stat-comp {
  background: #ffffff !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 12px !important;
}

/* Status Colors for Session List */
.status-completed {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.status-scheduled {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.status-cancelled {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.status-rescheduled {
  color: #ea580c;
  background: rgba(234, 88, 12, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}
```

### 8.4 Session Status Column Formatting

In your Table component, for the `session_status` column, either:

**Option A: Use Tag column type** with these color mappings:
- Completed → Green
- Scheduled → Blue
- Cancelled → Red
- Rescheduled → Orange

**Option B: Custom render function:**
```javascript
return `<span class="status-${value.toLowerCase()}">${value}</span>`
```

### 8.5 Key Design Principles

1. **Warm, not cold** - Use cream backgrounds `#fef9f3`, not pure white or gray
2. **Soft borders** - Tan `#e8d4b8` instead of harsh gray
3. **Golden accents** - Primary actions use oak brown `#a0704b`
4. **Generous radius** - 12px for cards, 8px for buttons/inputs
5. **Subtle shadows** - Light, warm-tinted shadows

---

## Step 9: Complete Theme & Layout Improvements

### 9.1 Full Theme CSS

Replace your app CSS with this comprehensive stylesheet:

```css
/* === TUTORING SYSTEM THEME - COMPLETE === */

/* ============ GLOBAL ============ */
.canvas-container, body {
  background-color: #fef9f3 !important;
  font-family: Inter, system-ui, -apple-system, sans-serif !important;
}

/* ============ FILTERS ============ */
label, .form-label, .ant-form-item-label {
  color: #6b5a4a !important;
  font-weight: 500 !important;
}

.ant-picker {
  border-color: #e8d4b8 !important;
  border-radius: 8px !important;
  background: #ffffff !important;
}

.ant-picker:hover, .ant-picker-focused {
  border-color: #a0704b !important;
  box-shadow: 0 0 0 2px rgba(160, 112, 75, 0.1) !important;
}

.ant-select-selector {
  border-color: #e8d4b8 !important;
  border-radius: 8px !important;
  background: #ffffff !important;
}

.ant-select-focused .ant-select-selector {
  border-color: #a0704b !important;
  box-shadow: 0 0 0 2px rgba(160, 112, 75, 0.1) !important;
}

.ant-select-selection-item {
  background: #f5f0e8 !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 4px !important;
  color: #2a2219 !important;
}

.ant-select-dropdown {
  background: #ffffff !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 8px !important;
}

.ant-select-item-option:hover {
  background: #fef9f3 !important;
}

/* ============ LIST ITEMS ============ */
.ant-list-item {
  background: #ffffff !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 12px !important;
  margin-bottom: 12px !important;
  box-shadow: 0 1px 3px rgba(160, 112, 75, 0.08) !important;
}

.ant-list-item:hover {
  box-shadow: 0 4px 12px rgba(160, 112, 75, 0.12) !important;
}

/* ============ INFO TAGS ============ */

/* Session ID - neutral warm */
.info-tag .ant-tag {
  background: #f5f0e8 !important;
  border: 1px solid #e8d4b8 !important;
  color: #2a2219 !important;
  border-radius: 6px !important;
}

/* Student name - text display */
.student-name-tag {
  color: #2a2219 !important;
  font-weight: 600 !important;
  font-size: 14px !important;
}

.student-name-tag span,
.student-name-tag div,
.student-name-tag p {
  color: #2a2219 !important;
  font-weight: 600 !important;
}

.student-name-tag .markdown-body {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  color: #2a2219 !important;
  font-weight: 600 !important;
  font-size: 14px !important;
}

.student-name-tag .markdown-body p {
  color: #2a2219 !important;
  font-weight: 600 !important;
  margin: 0 !important;
}

/* Grade/School - compact, subtle */
.compact-tag .ant-tag {
  background: #f5f0e8 !important;
  border: none !important;
  color: #6b5a4a !important;
  padding: 2px 8px !important;
  font-size: 12px !important;
  border-radius: 4px !important;
}

/* ============ NOTES FIELD ============ */

/* Container wrapper */
.notes-field {
  background: transparent !important;
}

/* Text display (markdown) */
.notes-field .markdown-body {
  background: #fef9f3 !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 8px !important;
  padding: 12px !important;
  color: #2a2219 !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
}

.notes-field .markdown-body p {
  color: #2a2219 !important;
  margin: 0 !important;
}

.notes-field .markdown-body a {
  color: #a0704b !important;
}

.notes-field .markdown-body code {
  background: #f5f0e8 !important;
  color: #2a2219 !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
}

.notes-field .markdown-body blockquote {
  border-left: 3px solid #e8d4b8 !important;
  padding-left: 12px !important;
  color: #6b5a4a !important;
}

/* Input mode (if editable) */
.notes-field .ant-input,
.notes-field textarea,
.notes-field input {
  background: #fef9f3 !important;
  border: 1px solid #e8d4b8 !important;
  border-radius: 8px !important;
  color: #2a2219 !important;
}

.notes-field .ant-input:focus,
.notes-field textarea:focus {
  border-color: #a0704b !important;
  box-shadow: 0 0 0 2px rgba(160, 112, 75, 0.1) !important;
}

/* ============ STAR RATINGS ============ */
.ant-rate { color: #e8d4b8 !important; }
.ant-rate-star-full .anticon { color: #ca8a04 !important; }

/* ============ BUTTONS ============ */
.ant-btn-primary {
  background: #a0704b !important;
  border-color: #a0704b !important;
  border-radius: 8px !important;
}

.ant-btn-primary:hover {
  background: #cd853f !important;
  border-color: #cd853f !important;
}
```

### 9.2 Component Identifiers

Add these to target components for styling:
- Session ID tag: `info-tag`
- Student name tag: `student-name-tag`
- Grade/School tags: `compact-tag`
- Status tag: `status-tag`
- Notes field: `notes-field`

### 9.3 Feature Additions

**A. Session Detail Modal**
1. Add a Modal component
2. Create query `sessionDetails`:
```sql
SELECT sl.*, s.student_name, s.grade, s.school, t.tutor_name, e.location
FROM session_log sl
JOIN students s ON sl.student_id = s.id
JOIN tutors t ON sl.tutor_id = t.id
JOIN enrollments e ON sl.enrollment_id = e.id
WHERE sl.id = {{selectedSessionId.value}}
```
3. On list item click: set `selectedSessionId`, run query, open modal

**B. Better Date Display**
```sql
DATE_FORMAT(sl.session_date, '%a, %d %b') as formatted_date
```
Shows: "Mon, 25 Nov" instead of "2025-11-25"

**C. Pagination**
- Add page state variable
- Query: `LIMIT 20 OFFSET {{(page - 1) * 20}}`
- Add pagination component

---

## Next Steps

After successful pilot:
1. **Add write operations** - Attendance marking form
2. **Deploy to cloud** - DigitalOcean, AWS, or Google Cloud Run
3. **Add user authentication** - Role-based access for tutors
4. **Migrate more workflows** - Homework tracking, scheduling

---

## Resources

- Lowcoder Documentation: https://docs.lowcoder.cloud/
- Lowcoder GitHub: https://github.com/lowcoder-org/lowcoder
- Docker Desktop: https://docs.docker.com/desktop/
