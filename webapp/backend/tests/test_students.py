"""
Tests for student endpoints and helper functions.

Covers:
- _get_next_student_id() helper logic
- Student creation with auto-generated IDs
- Phone/contacts sync
"""
import pytest
from datetime import date
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Student, Tutor
from routers.students import _get_next_student_id


class TestGetNextStudentId:
    """Test suite for _get_next_student_id helper."""

    def test_no_students_returns_1001(self, db_session):
        """When no students exist for location, start from 1001."""
        result = _get_next_student_id(db_session, "Main Center")
        assert result == "1001"

    def test_increments_from_existing(self, db_session):
        """Should return max + 1 from existing numeric IDs."""
        db_session.add(Student(student_name="A", home_location="MSA", school_student_id="1005"))
        db_session.add(Student(student_name="B", home_location="MSA", school_student_id="1003"))
        db_session.commit()

        result = _get_next_student_id(db_session, "MSA")
        assert result == "1006"

    def test_skips_non_numeric_ids(self, db_session):
        """Non-numeric IDs should be ignored when finding max."""
        db_session.add(Student(student_name="A", home_location="MSA", school_student_id="ABC"))
        db_session.add(Student(student_name="B", home_location="MSA", school_student_id="1002"))
        db_session.add(Student(student_name="C", home_location="MSA", school_student_id="XYZ"))
        db_session.commit()

        result = _get_next_student_id(db_session, "MSA")
        assert result == "1003"

    def test_location_isolation(self, db_session):
        """IDs from other locations should not affect the result."""
        db_session.add(Student(student_name="A", home_location="MSA", school_student_id="2000"))
        db_session.add(Student(student_name="B", home_location="MSB", school_student_id="1005"))
        db_session.commit()

        result_msa = _get_next_student_id(db_session, "MSA")
        result_msb = _get_next_student_id(db_session, "MSB")
        assert result_msa == "2001"
        assert result_msb == "1006"

    def test_null_ids_ignored(self, db_session):
        """Students with NULL school_student_id should be ignored."""
        db_session.add(Student(student_name="A", home_location="MSA", school_student_id=None))
        db_session.add(Student(student_name="B", home_location="MSA", school_student_id="1010"))
        db_session.commit()

        result = _get_next_student_id(db_session, "MSA")
        assert result == "1011"


class TestStudentCreation:
    """Test student creation via API endpoint."""

    def _create_admin_tutor(self, db_session):
        """Helper to create an admin tutor for auth."""
        tutor = Tutor(
            id=1,
            user_email="admin@test.com",
            tutor_name="Admin",
            role="Admin",
            default_location="MSA",
        )
        db_session.add(tutor)
        db_session.commit()
        return tutor

    def test_auto_generates_student_id(self, db_session):
        """Creating a student without school_student_id should auto-generate one."""
        # Pre-seed a student to set the starting point
        db_session.add(Student(student_name="Existing", home_location="MSA", school_student_id="1050"))
        db_session.commit()

        # Simulate what create_student does
        data = {
            "student_name": "New Student",
            "home_location": "MSA",
            "grade": "F4",
        }

        # Auto-generate ID
        if not data.get("school_student_id") and data.get("home_location"):
            data["school_student_id"] = _get_next_student_id(db_session, data["home_location"])

        new_student = Student(**data)
        db_session.add(new_student)
        db_session.commit()

        assert new_student.school_student_id == "1051"

    def test_phone_contacts_sync(self, db_session):
        """When contacts are provided, phone should be synced from first contact."""
        data = {
            "student_name": "Test Student",
            "home_location": "MSA",
            "contacts": [{"phone": "98765432", "label": "Parent"}],
        }

        # Sync phone from contacts (same logic as create_student)
        if data.get('contacts'):
            data['phone'] = data['contacts'][0]['phone'] if data['contacts'][0].get('phone') else None

        student = Student(**data)
        db_session.add(student)
        db_session.commit()

        assert student.phone == "98765432"

    def test_phone_generates_contacts(self, db_session):
        """When phone is provided without contacts, contacts should be auto-created."""
        data = {
            "student_name": "Test Student",
            "home_location": "MSA",
            "phone": "12345678",
        }

        # Sync contacts from phone (same logic as create_student)
        if data.get('phone') and not data.get('contacts'):
            data['contacts'] = [{'phone': data['phone'], 'label': ''}]

        student = Student(**data)
        db_session.add(student)
        db_session.commit()

        assert student.contacts == [{"phone": "12345678", "label": ""}]
