"""Unit tests for the high-value handling charge (Feb 2026 spec).

Rule under test (from user, verbatim): "Stones valued at over US$ 100,000
calculated at 0.05% of the declared value exceeding US$ 100,000. The
handling charge is rounded up in increments of US$ 10. For instance, if a
stone's indicated value for testing is US$ 125,000, an additional handling
fee of US$ 20 applies."

These tests pin both:
  1. The pure `calculate_handling_charge` helper (the maths in isolation).
  2. Integration into `calculate_stone_fee_from_brackets` and
     `calculate_parcel_fee_from_brackets` (the actual public API used by
     every callsite in /routes).
"""

from pricing import (
    calculate_handling_charge,
    calculate_stone_fee_from_brackets,
    calculate_parcel_fee_from_brackets,
    PRICING_BRACKETS,
    COLOR_STABILITY_FEE,
)


class TestHandlingChargeMath:
    """Direct tests on the helper — no bracket lookup, no side channels."""

    def test_zero_at_or_below_threshold(self):
        assert calculate_handling_charge(0) == 0
        assert calculate_handling_charge(50_000) == 0
        assert calculate_handling_charge(100_000) == 0

    def test_user_spec_example_125k(self):
        """The exact example from the user's spec — $125k → $20."""
        assert calculate_handling_charge(125_000) == 20

    def test_110k_rounds_up_to_10(self):
        """$110k → excess $10k → 0.05% = $5 → ceil to $10."""
        assert calculate_handling_charge(110_000) == 10

    def test_120k_lands_exactly_on_10_boundary(self):
        """$120k → excess $20k → 0.05% = exactly $10 → stays $10 (no
        artificial bump to $20 from float precision)."""
        assert calculate_handling_charge(120_000) == 10

    def test_tiny_excess_still_minimum_10(self):
        """Any non-zero excess snaps to $10 minimum increment."""
        assert calculate_handling_charge(100_000.01) == 10
        assert calculate_handling_charge(100_001) == 10

    def test_large_value(self):
        """$1,000,000 → excess $900k → 0.05% = $450 → already on a $10
        boundary → $450."""
        assert calculate_handling_charge(1_000_000) == 450

    def test_ragged_amount_rounds_up(self):
        """$150,101 → excess $50,101 → 0.05% = $25.0505 → ceil to $30."""
        assert calculate_handling_charge(150_101) == 30

    def test_none_or_negative_is_zero(self):
        assert calculate_handling_charge(None) == 0  # type: ignore[arg-type]
        assert calculate_handling_charge(-100) == 0


class TestHandlingChargeInStoneFee:
    """Handling charge must be layered on top of the base bracket fee
    (Normal $200k+ bracket = $400 for Normal service)."""

    def test_high_value_stone_gets_handling_layered_on_top(self):
        # $250k, Normal service, no CS: base $400 (from PRICING_BRACKETS
        # 200k+ bracket) + handling.
        # Handling: excess $150k → 0.05% = $75 → already on boundary → $75.
        # Wait — $75 is NOT on a $10 boundary; ceil of 7.5 = 8 → $80.
        fee = calculate_stone_fee_from_brackets(
            250_000, "Normal", False, PRICING_BRACKETS, COLOR_STABILITY_FEE,
        )
        assert fee == 400 + 80

    def test_low_value_stone_no_handling(self):
        # $50k, Normal: bracket $250, no handling, no CS.
        fee = calculate_stone_fee_from_brackets(
            50_000, "Normal", False, PRICING_BRACKETS, COLOR_STABILITY_FEE,
        )
        assert fee == 250

    def test_user_example_layered_on_top_of_bracket_and_cs(self):
        # $125k Normal + CS: bracket $250 (50k-200k) + CS $50 + handling $20 = $320.
        fee = calculate_stone_fee_from_brackets(
            125_000, "Normal", True, PRICING_BRACKETS, COLOR_STABILITY_FEE,
        )
        assert fee == 250 + 50 + 20


class TestHandlingChargeInParcelFee:
    """Parcel: handling applied per stone using avg per-stone value."""

    def test_parcel_high_avg_value_gets_per_stone_handling(self):
        # Parcel of 2 stones, total value $260,000 → avg $130k per stone.
        # Per-stone bracket ($130k → 50k-200k bracket) Normal = $250.
        # Base parcel fee = $250 * 2 = $500.
        # Handling per stone ($130k): excess $30k → 0.05% = $15 → ceil to $20.
        # Total handling = $20 * 2 = $40.
        # Expected total: $500 + $40 = $540.
        fee = calculate_parcel_fee_from_brackets(
            value_total=260_000,
            stone_count=2,
            service_type="Normal",
            color_stability_test=False,
            mounted=False,
            brackets=PRICING_BRACKETS,
            color_stability_fee=COLOR_STABILITY_FEE,
            mounted_fee=50,
        )
        assert fee == 500 + 40

    def test_parcel_avg_below_threshold_no_handling(self):
        # 3-stone parcel, total $150k → avg $50k → no handling (at threshold
        # boundary — $50k ≤ $100k).
        # Bracket for $50k Normal = $250. Base = $250 * 3 = $750. Total $750.
        fee = calculate_parcel_fee_from_brackets(
            value_total=150_000,
            stone_count=3,
            service_type="Normal",
            color_stability_test=False,
            mounted=False,
            brackets=PRICING_BRACKETS,
            color_stability_fee=COLOR_STABILITY_FEE,
            mounted_fee=50,
        )
        assert fee == 750
