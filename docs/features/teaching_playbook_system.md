# Teaching Playbook System - Technical Specification

## Overview
Enhanced curriculum tracking system that captures not just WHAT schools teach, but HOW tutors teach it effectively, including exercise materials and effectiveness ratings.

## Current Status (as of 2025-09-04)
- ✅ Basic curriculum reference working (historical 2024-2025 data)
- ✅ 3-week flexible matching implemented
- ✅ AppSheet showing curriculum suggestions
- 🚧 Teaching Playbook schema designed
- ⏳ Web service for real-time updates pending

## System Architecture

### Database Schema

#### 1. curriculum_entries
Tracks what topics are taught each week.
- Links: school, grade, stream, week number
- Consensus building through multiple confirmations
- Confidence scoring (1-5 scale)

#### 2. exercise_materials  
Tracks which materials and exercises are used.
- File paths from session_exercises
- Usage counts and effectiveness ratings
- Popular materials bubble up naturally

#### 3. curriculum_contributions
Records individual tutor contributions.
- Topic confirmations
- Exercise additions
- Effectiveness ratings
- Links sessions to curriculum entries

### Views

#### session_curriculum_suggestions
Shows 3-week curriculum window (Week N-1, N, N+1) from historical data only.

#### session_curriculum_suggestions_live
Enhanced view showing:
- Current year data (real-time collaborative)
- Historical data (fallback reference)
- Clear indicators: ✅ (Live) vs 📖 (Historical)

#### teaching_playbook
Complete view combining:
- Topics with confidence scores
- Popular exercises with ratings
- Contributor statistics

## User Experience Flow

### Read Phase (Current)
1. Tutor opens session in AppSheet
2. Sees 3-week curriculum suggestions:
   ```
   📚 Curriculum References:
   Week 1: 幾何初步（線段） 📖 (Historical) 👈 Likely
   Week 2: 代數式 (代入計算) 📖 (Historical)
   Week 3: 數軸、射線、線段 📖 (Historical)
   ```

### Write Phase (Coming)
1. Tutor taps "Confirm" or "Update"
2. AppSheet sends webhook to web service
3. Service writes to curriculum_entries (2025-2026)
4. Next tutor sees: ✅ (Live) data

### Exercise Integration (Coming)
1. System auto-captures exercises from session
2. Tutors rate effectiveness (1-5 stars)
3. Popular, effective materials surface for others
4. Creates institutional knowledge base

## Implementation Phases

### Phase 1: Foundation ✅
- Database schema created
- Historical data imported (2,308 records)
- Basic read-only view in AppSheet

### Phase 2: Enhanced Matching ✅
- 3-week window suggestions
- Smart early-September handling
- Live vs historical data distinction

### Phase 3: Teaching Playbook 🚧
- Comprehensive schema designed
- Exercise tracking integrated
- Effectiveness ratings included

### Phase 4: Web Service (Next)
- Node.js + Express API
- Cloud Run deployment
- Webhook endpoints for AppSheet
- Real-time curriculum updates

### Phase 5: Full Integration
- Exercise recommendations
- Collaborative filtering
- Analytics dashboard
- Performance tracking

## Technical Stack

- **Database**: MySQL with complex views
- **Backend**: Node.js + Express (planned)
- **Hosting**: Google Cloud Run
- **Frontend**: AppSheet mobile app
- **Authentication**: API key-based

## Benefits

### Immediate
- See last year's curriculum instantly
- 3-week context for flexibility
- Preview launched to tutors

### Short-term
- Real-time collaborative updates
- Exercise material sharing
- Reduced preparation time

### Long-term
- Institutional knowledge preservation
- Best practices emergence
- Quality standardization
- New tutor onboarding simplified

## Success Metrics
- Target: 50% session coverage within 2 weeks
- 70% of entries with confidence ≥3
- Average 3+ exercises per curriculum entry
- 80% tutor participation rate

## Migration Path
1. Current: `session_curriculum_suggestions` view (historical only)
2. Next: `session_curriculum_suggestions_live` view (real-time + historical)
3. Future: Full `teaching_playbook` with exercise integration