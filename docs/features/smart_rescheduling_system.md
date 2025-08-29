# Smart Rescheduling Recommendation System

## Overview

An intelligent system that analyzes tutor availability, student preferences, and historical patterns to recommend optimal alternative session times when rescheduling is needed.

---

## Implementation Timeline

**Target Start:** October 2025 (post-September enrollment rush)  
**Estimated Duration:** 8-12 weeks  
**Priority:** Phase 2 feature after planned reschedules

---

## Phase 1: Core Algorithm & Database (2-3 weeks)

### Database Schema Extensions

```sql
-- Tutor availability patterns
CREATE TABLE tutor_availability (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tutor_id INT NOT NULL,
    day_of_week VARCHAR(10) NOT NULL, -- Mon, Tue, Wed, etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(100) NOT NULL,
    preference_score INT DEFAULT 100 COMMENT '1-100, higher = more preferred',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    INDEX idx_tutor_day (tutor_id, day_of_week),
    INDEX idx_active (is_active)
) COMMENT 'Tutor available time windows with preference scoring';

-- Rescheduling history for ML learning
CREATE TABLE reschedule_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_session_id INT NOT NULL,
    suggested_date DATE,
    suggested_time VARCHAR(100),
    suggested_tutor_id INT,
    recommendation_score DECIMAL(5,2) COMMENT 'Algorithm confidence score',
    user_action VARCHAR(20) COMMENT 'ACCEPTED, REJECTED, IGNORED',
    user_feedback TEXT COMMENT 'Why rejected/issues',
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    responded_at TIMESTAMP NULL,
    FOREIGN KEY (original_session_id) REFERENCES session_log(id),
    FOREIGN KEY (suggested_tutor_id) REFERENCES tutors(id),
    INDEX idx_session (original_session_id),
    INDEX idx_action (user_action)
) COMMENT 'Tracks recommendation success for ML improvement';

-- Student scheduling preferences (learned from patterns)
CREATE TABLE student_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    preferred_days JSON COMMENT 'Array of preferred days ["Mon", "Wed", "Fri"]',
    preferred_times JSON COMMENT 'Array of time ranges',
    avoid_back_to_back BOOLEAN DEFAULT FALSE,
    min_gap_hours INT DEFAULT 2 COMMENT 'Minimum hours between sessions',
    location_preference VARCHAR(100),
    flexibility_score INT DEFAULT 50 COMMENT '1-100, higher = more flexible',
    last_updated TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE KEY unique_student_prefs (student_id)
) COMMENT 'Learned student scheduling preferences and constraints';
```

### Core Algorithm Design

```javascript
// Pseudocode for main recommendation engine
function generateRescheduleRecommendations(originalSessionId) {
    const session = getSessionDetails(originalSessionId);
    const student = getStudentWithPreferences(session.student_id);
    const tutor = getTutorWithAvailability(session.tutor_id);
    
    // Get candidate time slots
    const candidates = [];
    
    // 1. Same tutor, different times
    candidates.push(...findTutorAlternatives(tutor, session));
    
    // 2. Different tutors, same/similar times
    candidates.push(...findTutorSubstitutes(session));
    
    // 3. Completely different combinations
    candidates.push(...findFlexibleOptions(session));
    
    // Score each candidate
    const scoredCandidates = candidates.map(candidate => ({
        ...candidate,
        score: calculateRecommendationScore(candidate, session, student, tutor)
    }));
    
    // Return top 5 recommendations
    return scoredCandidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}

function calculateRecommendationScore(candidate, originalSession, student, originalTutor) {
    let score = 0;
    
    // Tutor continuity bonus (same tutor = better)
    if (candidate.tutor_id === originalSession.tutor_id) {
        score += 30;
    }
    
    // Tutor availability preference
    score += getTutorAvailabilityScore(candidate);
    
    // Student preference alignment
    score += getStudentPreferenceScore(candidate, student);
    
    // Time similarity bonus (closer to original time = better)
    score += getTimeSimilarityScore(candidate, originalSession);
    
    // Conflict penalty (overlaps with other sessions = bad)
    score -= getConflictPenalty(candidate, student);
    
    // Historical success rate (has this combo worked before?)
    score += getHistoricalSuccessRate(candidate, student);
    
    // Location preference bonus
    score += getLocationScore(candidate, student);
    
    return Math.max(0, Math.min(100, score)); // Clamp to 0-100
}
```

---

## Phase 2: AppSheet Integration (1-2 weeks)

### Virtual Columns for Sessions

```javascript
// In session_log table
"Reschedule_Recommendations" (EnumList):
// This would call a webhook to get recommendations
SPLIT(CONCATENATE(
    "Option 1: ", [Best_Alternative_1], "; ",
    "Option 2: ", [Best_Alternative_2], "; ",
    "Option 3: ", [Best_Alternative_3]
), ";")

"Can_Suggest_Alternatives" (Yes/No):
AND(
    [session_status] IN ("Scheduled", "Rescheduled - Pending Make-up"),
    [session_date] >= TODAY()
)
```

### Actions for Smart Rescheduling

```javascript
// Action: "Get Reschedule Suggestions"
// Calls webhook to recommendation engine
// Shows modal with top 5 alternatives

// Action: "Accept Recommendation"  
// Creates new session with recommended time
// Updates original session status
// Logs acceptance for ML learning
```

---

## Phase 3: Machine Learning Enhancement (3-4 weeks)

### Learning Algorithm

```python
# Python pseudocode for ML component
class RescheduleLearner:
    def __init__(self):
        self.preference_weights = {
            'tutor_continuity': 0.3,
            'time_similarity': 0.25, 
            'student_preference': 0.2,
            'availability_score': 0.15,
            'historical_success': 0.1
        }
    
    def update_from_feedback(self, attempt_id, user_action, feedback):
        """Learn from user accepting/rejecting recommendations"""
        attempt = get_reschedule_attempt(attempt_id)
        
        if user_action == 'ACCEPTED':
            # Increase weight of factors that led to this recommendation
            self.boost_successful_factors(attempt)
        elif user_action == 'REJECTED':
            # Decrease weight based on feedback
            self.adjust_from_rejection(attempt, feedback)
    
    def predict_success_probability(self, candidate, context):
        """Predict likelihood of user accepting this recommendation"""
        features = extract_features(candidate, context)
        return self.model.predict_proba(features)
```

### Seasonal/Contextual Adjustments

```javascript
function getSeasonalMultipliers(date) {
    const month = date.getMonth();
    
    // Exam periods - prefer fewer changes
    if (month === 4 || month === 11) { // May, December
        return { stability_bonus: 15, flexibility_penalty: -10 };
    }
    
    // Holiday periods - more flexibility acceptable
    if (month === 6 || month === 7) { // July, August
        return { stability_bonus: -5, flexibility_penalty: 0 };
    }
    
    return { stability_bonus: 0, flexibility_penalty: 0 };
}
```

---

## Phase 4: Advanced Features (2-3 weeks)

### Multi-Student Conflict Detection

```javascript
function detectScheduleConflicts(candidateSlot, studentId) {
    const conflicts = [];
    
    // Check student's other sessions
    const studentSessions = getStudentActiveSessions(studentId);
    studentSessions.forEach(session => {
        if (hasTimeOverlap(candidateSlot, session)) {
            conflicts.push({
                type: 'STUDENT_CONFLICT',
                session: session,
                severity: 'HIGH'
            });
        }
        
        if (isTooClose(candidateSlot, session)) {
            conflicts.push({
                type: 'INSUFFICIENT_GAP',
                session: session,
                severity: 'MEDIUM'
            });
        }
    });
    
    // Check tutor's other sessions
    const tutorSessions = getTutorActiveSessions(candidateSlot.tutor_id, candidateSlot.date);
    // ... similar logic for tutor conflicts
    
    return conflicts;
}
```

### Batch Rescheduling Engine

```javascript
function optimizeBatchReschedule(sessionIds) {
    const sessions = sessionIds.map(id => getSession(id));
    const constraints = gatherAllConstraints(sessions);
    
    // This becomes a constraint satisfaction problem
    const solution = solveSchedulingCSP(sessions, constraints);
    
    return solution.map(assignment => ({
        original_session_id: assignment.session_id,
        recommended_slot: assignment.new_slot,
        confidence: assignment.score,
        conflicts_resolved: assignment.conflicts_fixed
    }));
}
```

---

## Technical Architecture

### Webhook Integration

```javascript
// In Code.gs - new function for recommendation engine
function handleRescheduleRecommendations(data) {
    const sessionId = data.sessionId;
    const session = getSessionFromDB(sessionId);
    
    // Call recommendation algorithm
    const recommendations = generateRescheduleRecommendations(sessionId);
    
    // Return formatted recommendations to AppSheet
    return ContentService.createTextOutput(JSON.stringify({
        "Status": "Success",
        "Recommendations": recommendations.map(rec => ({
            "display": `${rec.tutor_name} on ${rec.date} at ${rec.time}`,
            "score": rec.score,
            "reason": rec.explanation,
            "data": rec
        }))
    })).setMimeType(ContentService.MimeType.JSON);
}
```

### Performance Considerations

- **Caching:** Cache tutor availability and student preferences  
- **Async Processing:** Run heavy calculations in background
- **Database Indexing:** Optimize queries with proper indexes
- **Rate Limiting:** Prevent API abuse from multiple recommendation requests

---

## Success Metrics

### Key Performance Indicators
- **Recommendation Accuracy:** % of suggestions accepted by users
- **Time Savings:** Reduction in manual rescheduling time
- **Conflict Reduction:** Fewer scheduling conflicts after implementation
- **User Satisfaction:** Tutor/admin feedback scores
- **System Performance:** Response time for generating recommendations

### A/B Testing Framework
- Compare manual vs. AI-assisted rescheduling outcomes
- Test different scoring algorithm weights
- Measure user engagement with recommendation feature

---

## Risk Mitigation

### Potential Issues & Solutions

**Algorithm Bias:**
- Risk: System recommends same tutors/times repeatedly
- Solution: Diversity injection in recommendations

**Performance Issues:**
- Risk: Slow recommendation generation
- Solution: Pre-computed candidate pools, caching

**User Adoption:**
- Risk: Users ignore recommendations
- Solution: Gradual rollout, training, clear explanations

**Data Quality:**
- Risk: Poor recommendations from bad data
- Solution: Data validation, fallback to manual scheduling

---

## Future Enhancements (Phase 5+)

- **Parent Integration:** Include parent preferences in scoring
- **Predictive Rescheduling:** Suggest proactive reschedules before conflicts arise
- **Group Class Optimization:** Handle multi-student session rescheduling
- **Mobile Optimization:** Quick reschedule suggestions in mobile app
- **Integration with Calendar Systems:** Sync with Google Calendar, Outlook

---

This comprehensive plan ensures when you return to this feature in October 2025, you'll have:
✅ Complete technical specifications  
✅ Database schema ready  
✅ Algorithm pseudocode  
✅ AppSheet integration plan  
✅ ML enhancement roadmap  
✅ Risk assessment and mitigation strategies

The smart rescheduling system will be an amazing differentiator for CSM Pro!