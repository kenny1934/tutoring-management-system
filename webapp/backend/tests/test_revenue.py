"""
Tests for revenue bonus calculation.

The bonus calculation is critical for tutor compensation.
These tests verify all 5 tiers and boundary conditions.

Tiers:
- 0 - 50,000: 0%
- 50,001 - 80,000: 5% of excess over 50k
- 80,001 - 90,000: 10% of excess over 80k + $1,500 from tier 2
- 90,001 - 120,000: 25% of excess over 90k + $2,500 from tiers 2-3
- 120,001+: 30% of excess over 120k + $10,000 from tiers 2-4
"""
import pytest
from decimal import Decimal
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.revenue import calculate_monthly_bonus


class TestCalculateMonthlyBonus:
    """Test suite for calculate_monthly_bonus function."""

    # =========================================================================
    # Tier 1: 0 - 50,000 (0% bonus)
    # =========================================================================

    def test_tier1_zero_revenue(self):
        """Zero revenue should yield zero bonus."""
        result = calculate_monthly_bonus(Decimal("0"))
        assert result == Decimal("0.00")

    def test_tier1_small_revenue(self):
        """Small revenue in tier 1 should yield zero bonus."""
        result = calculate_monthly_bonus(Decimal("10000"))
        assert result == Decimal("0.00")

    def test_tier1_mid_revenue(self):
        """Mid-tier 1 revenue should yield zero bonus."""
        result = calculate_monthly_bonus(Decimal("25000"))
        assert result == Decimal("0.00")

    def test_tier1_boundary_at_50000(self):
        """Exactly 50,000 should yield zero bonus (top of tier 1)."""
        result = calculate_monthly_bonus(Decimal("50000"))
        assert result == Decimal("0.00")

    # =========================================================================
    # Tier 2: 50,001 - 80,000 (5% of excess over 50k)
    # =========================================================================

    def test_tier2_just_over_boundary(self):
        """50,001 should yield 5% of $1 = $0.05."""
        result = calculate_monthly_bonus(Decimal("50001"))
        assert result == Decimal("0.05")

    def test_tier2_mid_revenue(self):
        """65,000 should yield 5% of $15,000 = $750."""
        result = calculate_monthly_bonus(Decimal("65000"))
        assert result == Decimal("750.00")

    def test_tier2_boundary_at_80000(self):
        """Exactly 80,000 should yield 5% of $30,000 = $1,500 (max tier 2)."""
        result = calculate_monthly_bonus(Decimal("80000"))
        assert result == Decimal("1500.00")

    # =========================================================================
    # Tier 3: 80,001 - 90,000 (10% of excess over 80k + $1,500)
    # =========================================================================

    def test_tier3_just_over_boundary(self):
        """80,001 should yield $1,500 + 10% of $1 = $1,500.10."""
        result = calculate_monthly_bonus(Decimal("80001"))
        assert result == Decimal("1500.10")

    def test_tier3_mid_revenue(self):
        """85,000 should yield $1,500 + 10% of $5,000 = $2,000."""
        result = calculate_monthly_bonus(Decimal("85000"))
        assert result == Decimal("2000.00")

    def test_tier3_boundary_at_90000(self):
        """Exactly 90,000 should yield $1,500 + 10% of $10,000 = $2,500."""
        result = calculate_monthly_bonus(Decimal("90000"))
        assert result == Decimal("2500.00")

    # =========================================================================
    # Tier 4: 90,001 - 120,000 (25% of excess over 90k + $2,500)
    # =========================================================================

    def test_tier4_just_over_boundary(self):
        """90,001 should yield $2,500 + 25% of $1 = $2,500.25."""
        result = calculate_monthly_bonus(Decimal("90001"))
        assert result == Decimal("2500.25")

    def test_tier4_mid_revenue(self):
        """105,000 should yield $2,500 + 25% of $15,000 = $6,250."""
        result = calculate_monthly_bonus(Decimal("105000"))
        assert result == Decimal("6250.00")

    def test_tier4_boundary_at_120000(self):
        """Exactly 120,000 should yield $2,500 + 25% of $30,000 = $10,000."""
        result = calculate_monthly_bonus(Decimal("120000"))
        assert result == Decimal("10000.00")

    # =========================================================================
    # Tier 5: 120,001+ (30% of excess over 120k + $10,000)
    # =========================================================================

    def test_tier5_just_over_boundary(self):
        """120,001 should yield $10,000 + 30% of $1 = $10,000.30."""
        result = calculate_monthly_bonus(Decimal("120001"))
        assert result == Decimal("10000.30")

    def test_tier5_mid_revenue(self):
        """150,000 should yield $10,000 + 30% of $30,000 = $19,000."""
        result = calculate_monthly_bonus(Decimal("150000"))
        assert result == Decimal("19000.00")

    def test_tier5_high_revenue(self):
        """200,000 should yield $10,000 + 30% of $80,000 = $34,000."""
        result = calculate_monthly_bonus(Decimal("200000"))
        assert result == Decimal("34000.00")

    def test_tier5_very_high_revenue(self):
        """500,000 should yield $10,000 + 30% of $380,000 = $124,000."""
        result = calculate_monthly_bonus(Decimal("500000"))
        assert result == Decimal("124000.00")

    # =========================================================================
    # Edge Cases
    # =========================================================================

    def test_negative_revenue(self):
        """Negative revenue should yield zero bonus (treated as tier 1)."""
        result = calculate_monthly_bonus(Decimal("-5000"))
        assert result == Decimal("0.00")

    def test_decimal_precision(self):
        """Verify decimal precision is maintained in calculations."""
        # 50,100 should yield 5% of 100 = 5.00
        result = calculate_monthly_bonus(Decimal("50100"))
        assert result == Decimal("5.00")

    def test_large_decimal(self):
        """Test with large decimal to verify precision."""
        # 100,000.50 should yield $2,500 + 25% of $10,000.50 = $5,000.125 → $5,000.12
        result = calculate_monthly_bonus(Decimal("100000.50"))
        expected = Decimal("5000.12")  # Rounded
        assert result == expected

    # =========================================================================
    # Cumulative Tier Verification
    # =========================================================================

    def test_cumulative_tiers_are_continuous(self):
        """Verify tier boundaries are continuous (no gaps or overlaps)."""
        # Just below and just above each boundary should differ by the rate

        # Tier 1→2 boundary (50,000 → 50,001): 0.00 → 0.05
        assert calculate_monthly_bonus(Decimal("50000")) == Decimal("0.00")
        assert calculate_monthly_bonus(Decimal("50001")) == Decimal("0.05")

        # Tier 2→3 boundary (80,000 → 80,001): 1500.00 → 1500.10
        assert calculate_monthly_bonus(Decimal("80000")) == Decimal("1500.00")
        assert calculate_monthly_bonus(Decimal("80001")) == Decimal("1500.10")

        # Tier 3→4 boundary (90,000 → 90,001): 2500.00 → 2500.25
        assert calculate_monthly_bonus(Decimal("90000")) == Decimal("2500.00")
        assert calculate_monthly_bonus(Decimal("90001")) == Decimal("2500.25")

        # Tier 4→5 boundary (120,000 → 120,001): 10000.00 → 10000.30
        assert calculate_monthly_bonus(Decimal("120000")) == Decimal("10000.00")
        assert calculate_monthly_bonus(Decimal("120001")) == Decimal("10000.30")

    def test_bonus_increases_monotonically(self):
        """Bonus should always increase (or stay same) as revenue increases."""
        revenues = [0, 25000, 50000, 60000, 80000, 85000, 90000, 100000, 120000, 150000, 200000]
        bonuses = [calculate_monthly_bonus(Decimal(str(r))) for r in revenues]

        for i in range(1, len(bonuses)):
            assert bonuses[i] >= bonuses[i-1], (
                f"Bonus should not decrease: {revenues[i-1]} → {revenues[i]}, "
                f"bonus {bonuses[i-1]} → {bonuses[i]}"
            )


class TestBonusCalculationRealWorldScenarios:
    """Real-world scenarios to verify bonus calculations make business sense."""

    def test_average_tutor_scenario(self):
        """Average tutor earning $60k/month should get $500 bonus."""
        result = calculate_monthly_bonus(Decimal("60000"))
        # 5% of (60000 - 50000) = 5% of 10000 = 500
        assert result == Decimal("500.00")

    def test_high_performer_scenario(self):
        """High performer at $100k/month should get $5,000 bonus."""
        result = calculate_monthly_bonus(Decimal("100000"))
        # $2,500 (from tiers 2-3) + 25% of (100000 - 90000) = 2500 + 2500 = 5000
        assert result == Decimal("5000.00")

    def test_top_performer_scenario(self):
        """Top performer at $150k/month should get $19,000 bonus."""
        result = calculate_monthly_bonus(Decimal("150000"))
        # $10,000 (from tiers 2-4) + 30% of (150000 - 120000) = 10000 + 9000 = 19000
        assert result == Decimal("19000.00")

    def test_new_tutor_scenario(self):
        """New tutor with only $30k revenue should get no bonus."""
        result = calculate_monthly_bonus(Decimal("30000"))
        assert result == Decimal("0.00")
