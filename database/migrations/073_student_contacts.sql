-- Add contacts JSON column for multiple phone numbers with relationship labels
-- Each contact: {phone: string, label: string}
-- Labels: Mother, Father, Grandparent, Student, Guardian, or custom free text

ALTER TABLE students ADD COLUMN contacts JSON DEFAULT NULL
  COMMENT 'Array of contact objects: [{phone, label}]';

-- Migrate existing phone data into contacts array
UPDATE students
SET contacts = JSON_ARRAY(JSON_OBJECT('phone', phone, 'label', ''))
WHERE phone IS NOT NULL AND phone != '';
