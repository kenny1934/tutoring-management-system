# School Curriculum Tracking System - Technical Specification

## Executive Summary

The School Curriculum Tracking System is an intelligent, low-friction solution that helps tutors track and reference school curriculum progress across different schools, grades, and academic years. It combines historical data intelligence with collaborative input to provide tutors with valuable context for lesson planning.

## Problem Statement

### Current Challenges
1. **Visibility Issue**: Curriculum tracking spreadsheet is separate from daily workflow (out of sight, out of mind)
2. **Memory Decay**: Tutors forget to record curriculum details after sessions
3. **Retrieval Difficulty**: Historical data exists but is hard to access during session planning
4. **Low Compliance**: Many blank entries due to friction in the recording process
5. **Collaboration Gaps**: Tutors work in silos despite teaching same schools/grades

### Impact
- Tutors lack context about school progress when preparing materials
- Duplicate effort in discovering what schools are teaching
- Misalignment between tutoring content and school curriculum
- Lost institutional knowledge when tutors leave

## Solution Overview

### Core Concept
A "Curriculum Intelligence System" that:
- **Shows** last year's curriculum automatically (zero clicks)
- **Confirms** current curriculum with one tap
- **Learns** from collective tutor input
- **Suggests** materials based on curriculum patterns

### Key Innovations
1. **Passive Intelligence**: Shows historical data without any action required
2. **One-Tap Confirmation**: Reduce input friction to absolute minimum
3. **Consensus Building**: Multiple tutors contribute to single truth
4. **Smart Predictions**: Pattern recognition across years and schools

## System Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│                   CSM Pro (AppSheet)                 │
│                    [Central Hub]                     │
└────────────────┬────────────────────────────────────┘
                 │
     ┌───────────┼───────────┬──────────────┐
     ▼           ▼           ▼              ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐
│ MySQL   │ │   Web   │ │ Google  │ │  Redis   │
│   DB    │ │ Service │ │ Sheets  │ │  Cache   │
└─────────┘ └─────────┘ └─────────┘ └──────────┘
 [Storage]  [Intelligence] [Collab]  [Performance]
```

### Data Flow

1. **Historical Reference Flow**
   - Session view loads → Fetches last year's data → Display instantly
   - Zero action required from tutor

2. **Contribution Flow**
   - Tutor sees reference → Confirms/Edits → Updates consensus
   - One-tap for confirmation, quick form for edits

3. **Synchronization Flow**
   - MySQL ↔ Google Sheets (bidirectional, every 5 minutes)
   - Preserves collaborative spreadsheet workflow

## Features

### Phase 1: Minimum Viable Product (Week 1)

#### 1.1 Historical Reference Display
- **What**: Show last year's curriculum for same week/school/grade
- **Where**: Virtual column in session view
- **Value**: Immediate context with zero clicks

#### 1.2 One-Tap Confirmation
- **What**: Confirm curriculum matches with single tap
- **Where**: Button in session detail view
- **Value**: Build current year data with minimal friction

#### 1.3 Quick Edit Interface
- **What**: Mobile-optimized web page for curriculum updates
- **Where**: Linked from AppSheet via URL
- **Value**: Handle exceptions without leaving workflow

### Phase 2: Intelligence Layer (Week 2)

#### 2.1 Confidence Scoring
- **What**: Track how many tutors confirmed each topic
- **Display**: ✅ High (3+), ⚠️ Medium (2), ❌ Low (1)
- **Value**: Build trust in collaborative data

#### 2.2 Pattern Recognition
- **What**: Identify curriculum patterns across schools
- **Example**: "PCMS is usually 1 week ahead of SRL-C"
- **Value**: Better predictions for missing data

#### 2.3 Smart Suggestions
- **What**: Predict likely topics based on patterns
- **Example**: "Week 6 is 90% likely to be Chapter 6"
- **Value**: Pre-fill data to reduce input effort

### Phase 3: Collaboration Features (Week 3)

#### 3.1 Weekly Planning Dashboard
- **What**: Grid view of all schools/grades for the week
- **Where**: Web interface linked from AppSheet
- **Value**: Batch updates and overview

#### 3.2 Consensus Resolution
- **What**: Show when tutors disagree on topics
- **How**: Display both options, track votes
- **Value**: Transparent conflict resolution

#### 3.3 Progress Tracking
- **What**: Show curriculum coverage percentage
- **Display**: Progress bars per school/tutor
- **Value**: Gamification and accountability

## Database Schema

### Core Tables

```sql
-- Main curriculum records (one per school/grade/week combination)
CREATE TABLE school_curriculum (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year VARCHAR(20) NOT NULL,           -- '2024-2025'
    week_number INT NOT NULL,                     -- 1-45
    week_start_date DATE NOT NULL,                -- Monday of week
    week_end_date DATE NOT NULL,                  -- Sunday of week
    school VARCHAR(255) NOT NULL,                 -- 'PCMS', 'SRL-C', etc.
    grade VARCHAR(10) NOT NULL,                   -- 'F1', 'F2', 'F3', 'F4'
    lang_stream VARCHAR(10) NOT NULL,             -- 'C', 'E'
    
    -- Core content
    topic_consensus TEXT,                         -- Agreed-upon topic
    textbook VARCHAR(255),                        -- Textbook being used
    confidence_score INT DEFAULT 0,               -- Number of confirmations
    
    -- Pattern analysis
    predicted_topic TEXT,                         -- AI/pattern-based suggestion
    prediction_confidence DECIMAL(3,2),          -- 0.00-1.00
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_updated_by VARCHAR(255),
    
    -- Constraints
    UNIQUE KEY unique_curriculum (academic_year, week_number, school, grade, lang_stream),
    
    -- Indexes
    INDEX idx_lookup (school, grade, lang_stream, week_start_date),
    INDEX idx_week (academic_year, week_number),
    INDEX idx_current (week_start_date, week_end_date)
);

-- Individual contributions tracking
CREATE TABLE curriculum_contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    curriculum_id INT NOT NULL,
    session_id INT,                               -- Optional link to session
    tutor_id INT NOT NULL,
    
    -- Action details
    action_type ENUM('confirm', 'edit', 'dispute', 'note') NOT NULL,
    contributed_topic TEXT,                       -- What tutor observed/entered
    confidence_level ENUM('certain', 'likely', 'unsure') DEFAULT 'certain',
    notes TEXT,                                   -- Additional context
    
    -- Metadata
    contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),                       -- For basic security
    user_agent TEXT,                              -- Browser/device info
    
    -- Foreign keys
    FOREIGN KEY (curriculum_id) REFERENCES school_curriculum(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES session_log(id) ON DELETE SET NULL,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_curriculum (curriculum_id),
    INDEX idx_tutor (tutor_id),
    INDEX idx_session (session_id),
    INDEX idx_recent (contributed_at DESC)
);

-- Week calendar for academic year mapping
CREATE TABLE academic_weeks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year VARCHAR(20) NOT NULL,
    week_number INT NOT NULL,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    week_label VARCHAR(50),                       -- 'Week 1', 'Mid-term Break', etc.
    is_teaching_week BOOLEAN DEFAULT TRUE,        -- FALSE for holidays
    
    UNIQUE KEY unique_week (academic_year, week_number),
    INDEX idx_date_range (week_start_date, week_end_date)
);
```

### Session Log Extensions

```sql
-- Add curriculum tracking to existing session_log
ALTER TABLE session_log 
ADD COLUMN curriculum_checked BOOLEAN DEFAULT FALSE COMMENT 'Has tutor reviewed curriculum for this session',
ADD COLUMN curriculum_note TEXT COMMENT 'Quick notes about school progress',
ADD COLUMN last_curriculum_check TIMESTAMP NULL COMMENT 'When curriculum was last updated';
```

### Views for AppSheet Integration

```sql
-- Current week curriculum for quick display
CREATE VIEW curriculum_current_week AS
SELECT 
    sc.*,
    CASE 
        WHEN sc.confidence_score >= 3 THEN 'High'
        WHEN sc.confidence_score >= 2 THEN 'Medium' 
        WHEN sc.confidence_score >= 1 THEN 'Low'
        ELSE 'No Data'
    END as confidence_level,
    
    -- Count of contributions
    (SELECT COUNT(*) FROM curriculum_contributions cc 
     WHERE cc.curriculum_id = sc.id) as total_contributions,
     
    -- Last contributor
    (SELECT t.tutor_name FROM curriculum_contributions cc
     JOIN tutors t ON cc.tutor_id = t.id
     WHERE cc.curriculum_id = sc.id
     ORDER BY cc.contributed_at DESC LIMIT 1) as last_contributor
     
FROM school_curriculum sc
JOIN academic_weeks aw ON sc.academic_year = aw.academic_year 
    AND sc.week_number = aw.week_number
WHERE aw.week_start_date <= CURDATE() 
  AND aw.week_end_date >= CURDATE()
  AND aw.is_teaching_week = TRUE;

-- Historical reference for pattern matching
CREATE VIEW curriculum_historical_patterns AS
SELECT 
    school,
    grade, 
    lang_stream,
    week_number,
    academic_year,
    topic_consensus,
    confidence_score,
    
    -- Calculate similarity to other years
    LAG(topic_consensus) OVER (
        PARTITION BY school, grade, lang_stream, week_number 
        ORDER BY academic_year
    ) as previous_year_topic
    
FROM school_curriculum
WHERE confidence_score >= 2
ORDER BY school, grade, lang_stream, week_number, academic_year;
```

## API Specification

### Base URL
- Development: `http://localhost:3000`
- Production: `https://curriculum.mathconceptsecondary.academy`

### Authentication
- Method: Session-based via AppSheet integration
- Parameters: `tutor_email`, `session_id` (validated against database)

### Core Endpoints

#### Get Curriculum Reference
```
GET /api/curriculum/reference
Parameters:
  - school: string (required)
  - grade: string (required) 
  - lang_stream: string (required)
  - date: string (YYYY-MM-DD, defaults to today)
  
Response:
{
  "current_year": {
    "topic": "有理數乘除",
    "confidence": "High",
    "confirmations": 3,
    "last_updated": "2025-09-02"
  },
  "previous_year": {
    "topic": "有理數加減運算", 
    "week": 5,
    "year": "2024-2025"
  },
  "suggestions": [
    {"topic": "有理數", "confidence": 0.85},
    {"topic": "分數運算", "confidence": 0.62}
  ]
}
```

#### Confirm Curriculum
```
POST /api/curriculum/confirm
Body:
{
  "curriculum_id": 123,
  "session_id": 456,
  "tutor_email": "tutor@example.com",
  "confidence": "certain"
}

Response:
{
  "success": true,
  "new_confidence_score": 4,
  "contribution_id": 789
}
```

#### Update Curriculum
```
POST /api/curriculum/update
Body:
{
  "curriculum_id": 123,
  "session_id": 456, 
  "tutor_email": "tutor@example.com",
  "new_topic": "代數式入門",
  "notes": "Students moved ahead this week",
  "confidence": "certain"
}

Response:
{
  "success": true,
  "curriculum_id": 123,
  "contribution_id": 790,
  "consensus_updated": true
}
```

#### Get Weekly Overview
```
GET /api/curriculum/weekly
Parameters:
  - week_start: string (YYYY-MM-DD)
  - tutor_email: string (to filter relevant schools)
  
Response:
{
  "week_info": {
    "week_number": 5,
    "week_start": "2025-09-01",
    "week_end": "2025-09-07"
  },
  "schools": [
    {
      "school": "PCMS",
      "grade": "F2",
      "stream": "C", 
      "current_topic": "有理數乘除",
      "confidence": "High",
      "last_year_topic": "有理數加減"
    }
  ]
}
```

## User Interface Design

### AppSheet Integration Points

#### 1. Session Detail View Enhancement
Add a "Curriculum Reference" section:

```
┌─────────────────────────────────────┐
│ 📚 Curriculum Reference             │
├─────────────────────────────────────┤
│ School: PCMS F2C                    │
│                                     │
│ Last Year (Week 5):                 │
│ 📖 有理數加減運算                   │
│                                     │
│ This Year:                          │
│ ✅ 有理數乘除 (3 tutors confirmed)  │
│                                     │
│ Actions:                            │
│ [👍 Confirm] [✏️ Update] [📊 View]  │
└─────────────────────────────────────┘
```

#### 2. Virtual Columns
Add to session_log table view:
- `last_year_curriculum`: Historical reference
- `curriculum_status`: Current year status
- `curriculum_confidence`: Trust level indicator

### Web Interface Pages

#### 1. Quick Entry Page (Mobile-First)
URL: `/quick-entry?session_id=XXX`

```
┌─────────────────────────────────────┐
│        PCMS F2C - Week 5            │
│        Sept 1-7, 2025               │
├─────────────────────────────────────┤
│                                     │
│  📚 Last Year Reference:            │
│  ┌─────────────────────────────┐   │
│  │ 有理數加減運算               │   │
│  │ (Week 5, 2024-2025)         │   │
│  └─────────────────────────────┘   │
│                                     │
│  🎯 This Year Status:               │
│  ┌─────────────────────────────┐   │
│  │ 有理數乘除                   │   │
│  │ ✅ Confirmed by 3 tutors     │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     ✓ Confirm & Return       │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     ✏️ Different Topic       │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     📝 Add Note              │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

#### 2. Weekly Dashboard
URL: `/dashboard/weekly`

Grid view showing all schools/grades for current week with:
- Color-coded confidence levels
- Batch edit capabilities
- Historical comparison
- Progress tracking

#### 3. Edit Form
URL: `/edit?curriculum_id=XXX`

Simple form with:
- Pre-filled current topic
- Suggestions based on patterns
- Confidence level selector
- Optional notes field
- Quick save and return

## Implementation Timeline

### Week 1: Foundation Setup

#### Day 1: Database and Schema
- [ ] Create new tables in existing MySQL database
- [ ] Set up academic_weeks with 2024-2025 and 2025-2026 calendars
- [ ] Add curriculum-related columns to session_log
- [ ] Create views for AppSheet integration

#### Day 2: Historical Data Import
- [ ] Extract data from existing Google Sheets (2024-2025)
- [ ] Parse week headers to determine date ranges
- [ ] Import into school_curriculum table with high confidence scores
- [ ] Validate data integrity and fix inconsistencies

#### Day 3: AppSheet Integration - Read Only
- [ ] Add virtual columns to session_log for curriculum display
- [ ] Test historical data display in session detail view
- [ ] Add "View Curriculum" action button (links to web service)

### Week 2: Web Service Development

#### Day 4-5: Core Web Service
- [ ] Set up Node.js project structure
- [ ] Implement core API endpoints
- [ ] Create mobile-optimized quick entry page
- [ ] Deploy to Google Cloud Run

#### Day 6: AppSheet Action Integration
- [ ] Add "Update Curriculum" webhook action
- [ ] Implement confirmation and update workflows
- [ ] Test complete integration flow

#### Day 7: Intelligence Features
- [ ] Implement pattern matching algorithms
- [ ] Add confidence scoring logic
- [ ] Create smart suggestion system

### Week 3: Launch and Optimization

#### Day 8-9: Google Sheets Sync
- [ ] Implement bidirectional synchronization
- [ ] Handle conflict resolution
- [ ] Test collaborative editing

#### Day 10: Soft Launch
- [ ] Deploy to production environment
- [ ] Launch with 3 volunteer tutors
- [ ] Gather initial feedback

#### Day 11-12: Refinement
- [ ] Fix issues discovered in soft launch
- [ ] Optimize performance and user experience
- [ ] Prepare training materials

#### Day 13: Full Launch
- [ ] Deploy to all 9 tutors
- [ ] Provide training session
- [ ] Begin tracking adoption metrics

## Success Metrics and KPIs

### Adoption Metrics
- **Primary**: Percentage of sessions with curriculum data
  - Target: 50% within 2 weeks, 80% within 4 weeks
- **Secondary**: Daily active users viewing curriculum
  - Target: 7/9 tutors daily within 2 weeks

### Efficiency Metrics
- **Confirmation Time**: Average time to confirm curriculum
  - Target: <3 seconds
- **Edit Time**: Average time to update curriculum
  - Target: <30 seconds  
- **Page Load Speed**: Web service response time
  - Target: <2 seconds

### Quality Metrics
- **Confidence Score Distribution**: 
  - Target: 70% of entries with confidence ≥3
- **Coverage**: School/grade combinations documented
  - Target: 80% coverage within 4 weeks
- **Accuracy**: Dispute rate on consensus topics
  - Target: <5% dispute rate

### Behavior Change Metrics
- **Proactive Updates**: Updates made during sessions vs. after
  - Target: 60% during sessions
- **Note Quality**: Length and usefulness of curriculum notes
  - Target: 40% include additional context
- **Peer Learning**: Usage of other tutors' curriculum data
  - Target: 50% view peer data weekly

## Technical Requirements

### Performance Requirements
- **Concurrent Users**: Support 9 simultaneous users
- **Response Time**: <2 seconds for all API calls
- **Uptime**: 99.9% during tutoring hours (2 PM - 10 PM SGT)
- **Database**: Handle 3 years of curriculum data (≈10,000 records)

### Security Requirements
- **Authentication**: Validate tutor identity via AppSheet session
- **Data Protection**: SSL encryption for all connections
- **Audit Trail**: Log all curriculum updates with user and timestamp
- **Backup**: Daily automated backups of curriculum data

### Scalability Requirements
- **User Growth**: Support up to 15 tutors (67% growth)
- **School Growth**: Support up to 20 schools (current: 10)
- **Historical Data**: Maintain 5 years of records
- **API Calls**: Handle 1000 requests/day

## Risk Analysis and Mitigation

### Risk 1: Low Adoption Rate
**Probability**: Medium  
**Impact**: High  
**Mitigation**:
- Show immediate value with historical data (no input required)
- Make confirmation extremely simple (one tap)
- Provide gentle reminders, not mandatory requirements
- Gather feedback early and iterate quickly

### Risk 2: Data Quality Issues
**Probability**: Medium  
**Impact**: Medium  
**Mitigation**:
- Implement confidence scoring to highlight uncertain data
- Show multiple tutor inputs when consensus is unclear
- Provide easy dispute mechanism for incorrect information
- Regular review of low-confidence entries

### Risk 3: Technical Failures
**Probability**: Low  
**Impact**: Medium  
**Mitigation**:
- Graceful degradation (AppSheet works without web service)
- Google Sheets remains available as backup
- Automated monitoring and alerts
- Simple rollback procedures

### Risk 4: User Resistance to Change
**Probability**: Low  
**Impact**: Medium  
**Mitigation**:
- Minimal change to existing workflow
- Immediate visible benefit (historical reference)
- Optional participation initially
- Clear training and support

## Cost Analysis

### Development Costs
- **Internal Development**: $0 (existing resources)
- **External Services**: $0 (using existing Google Cloud credits)
- **Total Development**: $0

### Infrastructure Costs (Monthly)
- **Google Cloud Run**: $0-5 (likely free tier)
- **Cloud SQL**: $0 (using existing database)
- **Redis Cache**: $0 (Cloud Memorystore free tier)
- **Domain SSL**: $0 (Let's Encrypt)
- **Total Infrastructure**: $0-5/month

### Operational Costs (Annual)
- **Monitoring**: $0 (Google Cloud free tier)
- **Backups**: $0 (included in Cloud SQL)
- **Support**: $0 (internal)
- **Total Operational**: $0-60/year

### ROI Calculation
**Time Saved**:
- 9 tutors × 30 minutes/week × $50/hour = $225/week
- Annual savings: $11,700

**Investment**:
- One-time: $0
- Annual: $0-60

**ROI**: 19,500% - 99,900% (effectively infinite)

## Future Enhancements (Post-MVP)

### Phase 4: Advanced Intelligence (Month 2)
- **Predictive Analytics**: Forecast curriculum progression
- **Anomaly Detection**: Flag unusual pace changes
- **Resource Matching**: Auto-suggest relevant worksheets
- **Performance Correlation**: Link curriculum pace to student outcomes

### Phase 5: Integration Expansion (Month 3)
- **Worksheet Library**: Link topics to material library
- **Parent Communication**: Share curriculum progress with parents
- **School Integration**: API connections with school systems
- **Mobile App**: Dedicated mobile application (if usage justifies)

### Phase 6: Advanced Collaboration (Month 6)
- **Real-time Updates**: Live collaboration like Google Docs
- **Discussion Threads**: Comments and discussions on topics
- **Expert Knowledge**: Integration with subject matter experts
- **AI Tutoring**: GPT integration for curriculum suggestions

## Conclusion

The School Curriculum Tracking System represents a strategic investment in tutor efficiency and educational quality. By reducing friction to near-zero while providing immediate value, it addresses the core behavioral challenges that have prevented successful curriculum documentation in the past.

The system's design prioritizes:
1. **Immediate Value**: Historical data provides instant benefit
2. **Minimal Friction**: One-tap interactions prevent abandonment
3. **Collaborative Intelligence**: Collective input improves accuracy
4. **Seamless Integration**: Works within existing workflow

With an ROI exceeding 19,000% and minimal technical risk, this system offers exceptional value for a minimal investment.

## Appendices

### Appendix A: Database Migration Scripts
[Detailed SQL scripts for database setup]

### Appendix B: API Documentation
[Complete API reference with examples]

### Appendix C: User Training Materials  
[Step-by-step guides and video scripts]

### Appendix D: Monitoring and Alerting Setup
[Configuration for system monitoring]