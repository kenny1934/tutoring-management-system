-- =====================================================
-- Migration 024: Add Manual WeCom Send Capability
-- =====================================================
-- Purpose: Allow Super Admin to manually send messages to WeCom groups from tutor_messages

SELECT 'Adding manual WeCom send capability...' as status;

-- ============================================================================
-- ADD TARGET GROUP COLUMN TO TUTOR_MESSAGES
-- ============================================================================

ALTER TABLE tutor_messages
ADD COLUMN target_wecom_group VARCHAR(50) NULL COMMENT 'Which WeCom group to send to: admin_group, tutor_group, parent_group',
ADD COLUMN wecom_sent_manually BOOLEAN DEFAULT FALSE COMMENT 'TRUE if manually sent via action button',
ADD COLUMN wecom_sent_manually_at TIMESTAMP NULL COMMENT 'When manually sent to WeCom',
ADD COLUMN wecom_sent_manually_by VARCHAR(255) COMMENT 'Email of user who manually sent';

-- Add index for filtering
CREATE INDEX idx_wecom_manual ON tutor_messages(wecom_sent_manually, target_wecom_group);

SELECT 'Added manual WeCom send fields to tutor_messages.' as result;

-- ============================================================================
-- NOTES FOR APPSHEET CONFIGURATION
-- ============================================================================

-- After running this migration, configure AppSheet:
--
-- 1. Add column 'target_wecom_group' as Enum:
--    - Values: admin_group, tutor_group, parent_group
--    - Labels: Admin Team, Tutor Team, Parent Group
--    - Show_If: USERROLE() = "Super Admin"
--
-- 2. Create Action "Send to WeCom Group"
--    - Accessibility: Only if USERROLE() = "Super Admin"
--    - Behavior: Grouped Action
--      a) Call webhook with LOOKUP([target_wecom_group], ...)
--      b) Set wecom_sent_manually = TRUE
--      c) Set wecom_sent_manually_at = NOW()
--      d) Set wecom_sent_manually_by = USEREMAIL()
--
-- 3. Webhook body format (news type for images):
--    {
--      "msgtype": "news",
--      "news": {
--        "articles": [{
--          "title": "<<[subject]>>",
--          "description": "<<[message]>>\n\nFrom: <<[from_tutor_id].[tutor_name]>> | Priority: <<[priority]>>",
--          "url": "<<APPLINK()>>",
--          "picurl": "<<[image_attachment]>>"
--        }]
--      }
--    }

SELECT 'MIGRATION 024 COMPLETED - Manual WeCom send capability ready.' as final_status;

-- =====================================================
-- END Migration 024
-- =====================================================
