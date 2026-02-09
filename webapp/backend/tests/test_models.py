"""Tests for ORM model integrity — catches mismatches between models and DB schema."""
import pytest
from models import SessionLog

# Columns that are GENERATED ALWAYS AS in MySQL and must use Computed() in the ORM.
# When adding new generated columns to migrations, add them here too.
GENERATED_COLUMNS = {
    SessionLog: ["active_student_slot_guard", "active_makeup_for_guard"],
}


class TestGeneratedColumns:
    """Verify generated columns are marked with Computed() so SQLAlchemy excludes them from INSERTs."""

    @pytest.mark.parametrize("model,column_name", [
        (model, col)
        for model, cols in GENERATED_COLUMNS.items()
        for col in cols
    ])
    def test_generated_column_has_computed(self, model, column_name):
        column = model.__table__.columns[column_name]
        assert column.computed is not None, (
            f"{model.__name__}.{column_name} is a MySQL generated column "
            f"but is missing Computed() in the ORM model. "
            f"SQLAlchemy will try to INSERT values for it, causing MySQL error 3105."
        )
