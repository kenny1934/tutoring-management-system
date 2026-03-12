"""
Tests for parent communication helper functions.

Covers:
- calculate_contact_status() — classifies days since contact into status labels
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.parent_communications import calculate_contact_status


class TestCalculateContactStatus:
    """Test suite for calculate_contact_status function."""

    # Default thresholds: recent=28, warning=50

    def test_never_contacted(self):
        """999+ days = Never Contacted."""
        assert calculate_contact_status(999, 28, 50) == "Never Contacted"
        assert calculate_contact_status(1500, 28, 50) == "Never Contacted"

    def test_recent_within_threshold(self):
        """Days ≤ recent_threshold = Recent."""
        assert calculate_contact_status(0, 28, 50) == "Recent"
        assert calculate_contact_status(10, 28, 50) == "Recent"

    def test_recent_at_boundary(self):
        """Exactly at recent threshold = Recent (≤)."""
        assert calculate_contact_status(28, 28, 50) == "Recent"

    def test_been_a_while(self):
        """Between recent and warning thresholds."""
        assert calculate_contact_status(35, 28, 50) == "Been a While"

    def test_been_a_while_at_boundary(self):
        """Exactly at warning threshold = Been a While (≤)."""
        assert calculate_contact_status(50, 28, 50) == "Been a While"

    def test_contact_needed(self):
        """Beyond warning threshold = Contact Needed."""
        assert calculate_contact_status(51, 28, 50) == "Contact Needed"
        assert calculate_contact_status(100, 28, 50) == "Contact Needed"

    def test_custom_thresholds(self):
        """Works with non-default thresholds."""
        assert calculate_contact_status(10, 14, 30) == "Recent"
        assert calculate_contact_status(14, 14, 30) == "Recent"
        assert calculate_contact_status(15, 14, 30) == "Been a While"
        assert calculate_contact_status(30, 14, 30) == "Been a While"
        assert calculate_contact_status(31, 14, 30) == "Contact Needed"
