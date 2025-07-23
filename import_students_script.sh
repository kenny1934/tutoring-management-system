gcloud sql import csv csm-regular-course-db gs://csm-app-data-import-12345/students.csv \
--database=csm_db \
--table=students \
--columns=school_student_id,student_name,grade,phone,school,lang_stream,home_location