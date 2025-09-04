-- Teaching Playbook Schema Design
-- Complete curriculum + exercise tracking system
-- Enables collaborative sharing of both WHAT to teach and HOW to teach it

-- Enhanced curriculum table with exercise tracking
DROP TABLE IF EXISTS curriculum_entries;
CREATE TABLE curriculum_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year VARCHAR(20) NOT NULL,
    week_number INT NOT NULL,
    school VARCHAR(255) NOT NULL,
    grade VARCHAR(10) NOT NULL,
    lang_stream VARCHAR(10) NOT NULL,
    
    -- Topic information (what to teach)
    topic_consensus TEXT,
    topic_description TEXT,  -- Detailed description for clarity
    
    -- Metadata
    created_by INT,  -- tutor_id who created entry
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_by INT,
    last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Consensus building
    confirmation_count INT DEFAULT 1,  -- How many tutors confirmed this topic
    confidence_score INT DEFAULT 3,    -- 1-5 scale, increases with confirmations
    
    INDEX idx_lookup (academic_year, week_number, school, grade, lang_stream),
    INDEX idx_current_year (academic_year, school, grade, lang_stream),
    FOREIGN KEY (created_by) REFERENCES tutors(id),
    FOREIGN KEY (last_modified_by) REFERENCES tutors(id)
);

-- Exercise materials tracking (how to teach it)
DROP TABLE IF EXISTS exercise_materials;
CREATE TABLE exercise_materials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    curriculum_entry_id INT NOT NULL,
    
    -- Exercise information
    file_path VARCHAR(500) NOT NULL,  -- From session_exercises table
    file_name VARCHAR(255),            -- Extracted filename for display
    file_type VARCHAR(50),             -- PDF, DOCX, etc.
    
    -- Usage tracking
    usage_count INT DEFAULT 1,         -- How many times used
    first_used_date DATE,
    last_used_date DATE,
    
    -- Effectiveness tracking
    avg_effectiveness_rating DECIMAL(3,2),  -- Average 1-5 rating
    total_ratings INT DEFAULT 0,
    
    -- Metadata
    added_by INT,                      -- tutor_id who added this
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_material (curriculum_entry_id, file_path),
    INDEX idx_popularity (curriculum_entry_id, usage_count DESC),
    FOREIGN KEY (curriculum_entry_id) REFERENCES curriculum_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES tutors(id)
);

-- Track individual tutor contributions and ratings
DROP TABLE IF EXISTS curriculum_contributions;
CREATE TABLE curriculum_contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    curriculum_entry_id INT NOT NULL,
    session_id INT NOT NULL,           -- Links to session_log
    tutor_id INT NOT NULL,
    
    -- What the tutor did
    action_type ENUM('confirm', 'update', 'add_exercise', 'rate_exercise') NOT NULL,
    
    -- Topic contribution
    topic_confirmed BOOLEAN DEFAULT FALSE,
    topic_suggested TEXT,               -- If they suggested different topic
    
    -- Exercise contribution
    exercise_material_id INT,           -- If they added/used an exercise
    effectiveness_rating INT,           -- 1-5 rating of the exercise
    
    -- Notes
    notes TEXT,                         -- Optional feedback
    
    -- Timestamp
    contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_tutor_contributions (tutor_id, contributed_at),
    INDEX idx_session_contribution (session_id),
    FOREIGN KEY (curriculum_entry_id) REFERENCES curriculum_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES session_log(id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (exercise_material_id) REFERENCES exercise_materials(id)
);

-- View to get complete teaching playbook with statistics
CREATE OR REPLACE VIEW teaching_playbook AS
SELECT 
    ce.id,
    ce.academic_year,
    ce.week_number,
    ce.school,
    ce.grade,
    ce.lang_stream,
    ce.topic_consensus,
    ce.topic_description,
    ce.confirmation_count,
    ce.confidence_score,
    
    -- Exercise statistics
    COUNT(DISTINCT em.id) as total_exercises,
    COUNT(DISTINCT em.file_path) as unique_materials,
    SUM(em.usage_count) as total_material_uses,
    
    -- Most popular exercise
    (SELECT em2.file_name 
     FROM exercise_materials em2 
     WHERE em2.curriculum_entry_id = ce.id 
     ORDER BY em2.usage_count DESC 
     LIMIT 1) as most_popular_exercise,
     
    -- Average effectiveness
    AVG(em.avg_effectiveness_rating) as avg_material_effectiveness,
    
    -- Contributor count
    COUNT(DISTINCT cc.tutor_id) as contributing_tutors

FROM curriculum_entries ce
LEFT JOIN exercise_materials em ON em.curriculum_entry_id = ce.id
LEFT JOIN curriculum_contributions cc ON cc.curriculum_entry_id = ce.id
GROUP BY ce.id;

-- Migration: Link existing session_exercises to curriculum entries
-- This will be populated as tutors confirm topics
ALTER TABLE session_exercises 
ADD COLUMN curriculum_entry_id INT,
ADD COLUMN effectiveness_rating INT,
ADD INDEX idx_curriculum_link (curriculum_entry_id),
ADD FOREIGN KEY (curriculum_entry_id) REFERENCES curriculum_entries(id);

-- Sample data structure for API responses
-- This shows what the web service will return
/*
{
  "curriculum_entry": {
    "id": 123,
    "topic": "幾何初步（線段）",
    "confidence": 5,
    "confirmations": 8
  },
  "exercises": [
    {
      "file_name": "F1_Geometry_Lines_Intro.pdf",
      "usage_count": 12,
      "effectiveness": 4.5,
      "your_rating": null  // Can rate if you use it
    },
    {
      "file_name": "Basic_Line_Segments_Worksheet.docx",
      "usage_count": 7,
      "effectiveness": 4.2,
      "your_rating": 4     // You rated this 4 stars
    }
  ],
  "statistics": {
    "contributing_tutors": 5,
    "total_sessions": 23,
    "coverage": "87%"
  }
}
*/