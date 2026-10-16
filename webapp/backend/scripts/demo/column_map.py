"""What the demo build does with every text column in the database.

The build refuses to run if the live schema has a text or JSON column that
isn't listed here. That's the guard against a future migration leaking data:
a new column can't slip through until someone decides which treatment it gets.

The treatments are:

- `keep`: no personal data, copied as it is.
- `who`: a staff member, stored as an email or a display name. Each real
  value maps to that person's one fake identity, so "kenny.chiu@..." and
  "Mr Kenny Chiu" both turn into the same fake tutor.
- `person`: a student's, parent's or outside tutor's name, swapped for a fake
  in the same shape.
- `phone`, `wechat`, `contacts`: numbers and handles, swapped for fakes.
- `code:<kind>`: an ID like MCP1112, keeping its letters and changing its digits.
- `stock:<pool>`: free text a person typed, replaced with a line from that
  pool in `stock_text.py`.
- `safe:<rule>:<pool>`: kept when it matches the rule (for text the app writes
  itself, like "Renewal of enrollment #123"), otherwise treated as `stock`.
- `subst`: text the app writes, with real names, emails and phone numbers
  swapped inside it.
- `path`: a file path. Paths through a staff folder get the name words inside
  them swapped, because those folders are named after students.
- `path_basename:<column>`: a file name on its own, treated like `path` when
  the full path in `<column>` on the same row goes through a staff folder.
- `url`: kept, except links to private Google files, which are emptied.
- `null`: emptied.
- `special`: handled by its own function in the build script, because the
  table needs more than one column changed together.

A table listed in `CLEAR_TABLES` is emptied whole, so its columns don't need
listing. Those tables hold logs, secrets or snapshots that no demo needs.
"""

CLEAR_TABLES = {
    "debug_audit_logs",            # copies of rows, SQL queries and admin IP addresses
    "wecom_message_log",           # messages sent to the real WeCom groups
    "wecom_webhooks",              # webhook secrets
    "push_subscriptions",          # real devices' push endpoints
    "report_shares",               # frozen parent reports with names inside the JSON
    "saved_reports",               # same
    "regular_application_edits",   # old and new values, which include names and phones
    "summer_application_edits",    # same
    "office_ip_whitelist",         # the offices' IP addresses
    "session_exercises_path_backup",  # a one-off backup of old file paths
    "curriculum_contributions",    # visitors' IP addresses and browsers
    "homework_files",              # photos of real students' work
}

COLUMNS: dict[str, dict[str, str]] = {
    "academic_weeks": {"academic_year": "keep", "week_label": "keep"},
    "buddy_access_cards": {"card_number": "code:card", "branch": "keep", "staff_name": "who"},
    "calendar_events": {
        # School exam dates and syllabuses. They're public, and School
        # Progress needs them to look real.
        "event_id": "keep", "title": "keep", "description": "keep", "school": "keep",
        "grade": "keep", "academic_stream": "keep", "event_type": "keep",
    },
    "class_requests": {
        "requested_time": "keep", "location": "keep", "session_type": "keep", "reason": "keep",
        "request_status": "keep", "requested_by": "who", "reviewed_by": "who", "review_notes": "keep",
    },
    "concept_code_aliases": {"code_space": "keep", "code": "keep"},
    "concept_links": {"kind": "keep", "source": "keep", "note": "keep"},
    "courseware_concepts": {
        "file_path": "path", "match_path": "path", "file_basename": "path_basename:match_path",
        "role": "keep", "lang": "keep", "source": "keep",
    },
    "curriculum_concepts": {
        "kind": "keep", "name_en": "keep", "name_zh": "keep", "grade": "keep", "notes": "keep",
        "strand": "keep", "atlas_grade": "keep", "atlas_series": "keep",
    },
    "discounts": {"discount_name": "keep", "discount_type": "keep"},
    "document_folders": {"name": "keep"},
    "document_versions": {
        "title": "keep", "content": "keep", "page_layout": "keep", "version_type": "keep", "label": "keep",
    },
    "documents": {
        "title": "keep", "doc_type": "keep", "content": "keep", "page_layout": "keep", "tags": "keep",
        "source_filename": "path", "questions": "keep", "solutions": "keep", "variants": "keep",
        "search_text": "keep",
    },
    "enrollments": {
        "assigned_day": "keep", "assigned_time": "keep", "location": "keep", "payment_status": "keep",
        "remark": "safe:enrollment_remark:enrollment_remark", "last_modified_by": "who", "promo_code": "keep",
        "extension_notes": "subst", "extension_granted_by": "who", "enrollment_type": "keep",
        "locked_discount_code": "keep", "discount_override_code": "keep",
        "discount_override_reason": "stock:discount_reason", "discount_override_by": "who",
    },
    "exam_rev_paper_concepts": {"source": "keep"},
    "exam_rev_papers": {
        "file_path": "path", "match_path": "path", "file_basename": "path_basename:match_path", "variant_paths": "path",
        "school": "keep", "grade": "keep", "lang_stream": "keep", "academic_year": "keep",
        "exam_kind": "keep", "scope_source": "keep",
    },
    "exam_revision_slots": {"time_slot": "keep", "location": "keep", "notes": "keep", "created_by": "who"},
    "exam_scope_concepts": {"matched_text": "keep", "source": "keep"},
    "extension_requests": {
        "reason": "safe:extension_reason:extension_reason", "proposed_reschedule_time": "keep",
        "request_status": "keep", "requested_by": "who", "reviewed_by": "who",
        "review_notes": "safe:extension_review:review_note",
    },
    "feature_events": {"event_key": "keep", "entity_type": "keep", "context": "keep", "dedupe_key": "keep"},
    "holidays": {"holiday_name": "keep"},
    "homework_completion": {
        "pdf_name": "path", "url": "url", "exercise_remarks": "safe:exercise_remark:exercise_remark",
        "completion_status": "keep", "homework_rating": "keep", "tutor_comments": "stock:hw_comment",
    },
    "lesson_ink": {"target_key": "keep", "pdf_name": "path", "strokes": "keep", "updated_by": "who"},
    "location_settings": {"location": "keep"},
    "makeup_proposal_slots": {
        "proposed_time_slot": "keep", "proposed_location": "keep", "slot_status": "keep",
        "rejection_reason": "safe:makeup_rejection:makeup_note",
    },
    "makeup_proposals": {"proposal_type": "keep", "notes": "stock:makeup_note", "status": "keep"},
    "message_likes": {"action_type": "keep", "emoji": "keep"},
    "message_templates": {"title": "keep", "content": "keep", "category": "keep"},
    "parent_communications": {
        "contact_method": "keep", "contact_type": "keep", "brief_notes": "special", "created_by": "who",
    },
    "path_alias_definitions": {"alias": "keep", "description": "keep"},
    "planned_reschedules": {
        "reason": "stock:reschedule_note", "status": "keep", "requested_by": "who",
        "notes": "stock:reschedule_note",
    },
    "primary_prospects": {
        "source_branch": "keep", "primary_student_id": "code:prospect", "student_name": "person",
        "school": "keep", "grade": "keep", "tutor_name": "person", "phone_1": "phone",
        "phone_1_relation": "keep", "phone_2": "phone", "phone_2_relation": "keep", "wechat_id": "wechat",
        "tutor_remark": "stock:prospect_remark", "wants_summer": "keep", "wants_regular": "keep",
        "preferred_branches": "keep", "preferred_time_note": "stock:preferred_time",
        "preferred_tutor_note": "null", "sibling_info": "null", "outreach_status": "keep",
        "contact_notes": "null", "status": "keep", "edit_history": "null",
    },
    "regular_applications": {
        "reference_code": "keep", "student_name": "person", "school": "keep", "grade": "keep",
        "lang_stream": "keep", "is_existing_student": "keep", "current_centers": "keep",
        "verified_branch_origin": "keep", "wechat_id": "wechat", "contact_phone": "phone",
        "preferred_location": "keep", "preference_1_day": "keep", "preference_1_time": "keep",
        "preference_2_day": "keep", "preference_2_time": "keep", "application_status": "keep",
        "admin_notes": "stock:application_note", "reviewed_by": "who", "form_language": "keep",
    },
    "regular_course_configs": {
        "title": "keep", "description": "keep", "locations": "keep", "available_grades": "keep",
        "time_slots": "keep", "existing_student_options": "keep", "center_options": "keep",
        "lang_stream_options": "keep", "text_content": "keep", "course_intro": "keep",
        "banner_image_url": "keep", "pricing_config": "keep",
    },
    "regular_course_slots": {
        "slot_day": "keep", "time_slot": "keep", "location": "keep", "grade": "keep", "lang_stream": "keep",
    },
    "regular_tutor_duties": {"location": "keep", "duty_day": "keep", "time_slot": "keep"},
    "school_aliases": {"alias_key": "keep", "target": "keep"},
    "school_curriculum": {
        "academic_year": "keep", "school": "keep", "grade": "keep", "lang_stream": "keep",
        "topic_consensus": "keep", "textbook": "keep", "predicted_topic": "keep", "last_updated_by": "who",
    },
    "school_topic_observations": {
        "school": "keep", "grade": "keep", "lang_stream": "keep", "academic_year": "keep",
        "source": "keep", "source_ref": "keep", "action": "keep", "origin": "keep", "excluded_reason": "keep",
    },
    "session_exercises": {
        "exercise_type": "keep", "pdf_name": "path", "created_by": "who",
        "remarks": "safe:exercise_remark:exercise_remark", "url": "url", "url_title": "keep",
        "answer_pdf_name": "path", "answer_remarks": "safe:exercise_remark:exercise_remark",
    },
    "session_log": {
        "time_slot": "keep", "location": "keep", "session_status": "keep", "financial_status": "keep",
        "notes": "stock:session_note", "performance_rating": "keep", "attendance_marked_by": "who",
        "previous_session_status": "keep", "last_modified_by": "who", "curriculum_note": "stock:session_note",
        "bulk_pdf_name": "path", "bulk_exercise_remarks": "safe:exercise_remark:exercise_remark",
        "bulk_exercise_type": "keep",
    },
    "student_coupons": {"last_synced_by": "who", "sync_source_file": "keep", "notes": "stock:application_note"},
    "student_radar_configs": {"config": "keep"},
    "students": {
        "school_student_id": "special", "student_name": "person", "grade": "keep", "phone": "phone",
        "school": "special", "lang_stream": "keep", "home_location": "keep",
        "staff_referral_notes": "stock:referral", "academic_stream": "keep", "contacts": "contacts",
    },
    "summer_applications": {
        "reference_code": "keep", "student_name": "person", "school": "keep", "grade": "keep",
        "lang_stream": "keep", "is_existing_student": "keep", "verified_branch_origin": "keep",
        "current_centers": "keep", "wechat_id": "wechat", "contact_phone": "phone",
        "preferred_location": "keep", "preference_1_day": "keep", "preference_1_time": "keep",
        "preference_2_day": "keep", "preference_2_time": "keep", "preference_3_day": "keep",
        "preference_3_time": "keep", "preference_4_day": "keep", "preference_4_time": "keep",
        "unavailability_notes": "stock:unavailability", "buddy_names": "null",
        "buddy_referrer_name": "person", "application_status": "keep",
        "admin_notes": "stock:application_note", "reviewed_by": "who", "form_language": "keep",
        "discount_override_code": "keep", "discount_override_reason": "stock:discount_reason",
        "discount_override_by": "who",
    },
    "summer_buddy_groups": {"buddy_code": "keep"},
    "summer_buddy_members": {
        "student_id": "code:buddy_student", "student_name_en": "person", "student_name_zh": "person",
        "parent_phone": "phone", "source_branch": "keep", "verification_status": "keep",
    },
    "summer_course_configs": {
        "title": "keep", "description": "keep", "pricing_config": "keep", "locations": "keep",
        "available_grades": "keep", "time_slots": "keep", "existing_student_options": "keep",
        "center_options": "keep", "lang_stream_options": "keep", "text_content": "keep",
        "banner_image_url": "keep", "course_intro": "keep",
    },
    "summer_course_slots": {
        "slot_day": "keep", "time_slot": "keep", "location": "keep", "grade": "keep",
        "slot_label": "keep", "course_type": "keep",
    },
    "summer_courseware_files": {
        "grade": "keep", "course_code": "keep", "topic_zh": "keep", "topic_en": "keep", "doc_type": "keep",
        "lang": "keep", "unclassified_reason": "keep", "rel_path": "keep", "file_name": "keep",
    },
    "summer_courseware_scans": {"root_name": "keep", "path_prefix": "keep", "scanned_by": "who"},
    "summer_lessons": {"lesson_status": "keep", "notes": "stock:memo"},
    "summer_sessions": {"session_status": "keep", "placed_by": "who"},
    "summer_tutor_duties": {"location": "keep", "duty_day": "keep", "time_slot": "keep"},
    "termination_records": {"reason": "stock:termination", "updated_by": "who", "reason_category": "keep"},
    "tutor_assistants": {"created_by": "who"},
    "tutor_branch_coverage": {"location": "keep", "weekday": "keep", "note": "stock:coverage_note", "created_by": "who"},
    "tutor_memos": {
        "time_slot": "keep", "location": "keep", "notes": "stock:memo", "exercises": "keep",
        "performance_rating": "keep", "status": "keep", "created_by": "who", "filled_by": "who",
        "dismissed_by": "who", "dismiss_reason": "keep",
    },
    "tutor_messages": {
        "subject": "special", "message": "special", "priority": "keep", "category": "keep",
        "image_attachment": "null", "image_attachments": "null", "file_attachments": "null",
    },
    "tutors": {
        "user_email": "special", "tutor_name": "special", "nickname": "special", "default_location": "keep",
        "role": "keep", "profile_picture": "null", "wecom_userid": "null",
    },
    "waitlist_entries": {
        "student_name": "person", "school": "keep", "grade": "keep", "lang_stream": "keep",
        "phone": "phone", "parent_name": "wechat", "notes": "stock:waitlist_note", "entry_type": "keep",
    },
    "waitlist_slot_preferences": {"location": "keep", "day_of_week": "keep", "time_slot": "keep"},
}

# Tables with no text columns at all. Listing them means a new table shows up
# in the check, even when it has nothing to anonymise yet.
NO_TEXT_TABLES = {
    "message_archives", "message_mentions", "message_pins",
    "message_read_receipts", "message_recipients", "message_snoozes", "thread_mutes",
    "thread_pins", "tutor_rdo",
}

# Rules for `safe:` columns. A value that fully matches is text the app wrote
# itself, or a value too short to name anyone, so it's kept.
SAFE_RULES = {
    "enrollment_remark": r"Renewal of enrollment #?\d+ - Created on [\d/ :-]+( by \S+@\S+)?|Dummy enrollment for special sessions"
                         r"|Free make-up class\. No fee due\.|Double Lesson",
    "extension_reason": r"補不了堂|Exam Rev|weather|Chinese New Year|遲開始|老師請假|F\d",
    # Kept, then run through the same name and email swap as `subst`.
    "extension_review": r"Extension granted by \S+",
    "exercise_remark": r"(Pages:\s*)?[\d,\-\s]+|half|all|剩下的?|LV\d",
    "makeup_rejection": r"Another slot was approved",
}

# Numbers that are personal even though they aren't text.
SENSITIVE_NUMBERS = {("tutors", "basic_salary")}
