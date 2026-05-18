"""Unit tests for `backend/jobs_helpers.py`.

The cancel-leak class of bugs (cancelled stones being silently re-summed
into job totals or customer-pay amounts) burned us three separate times
across `update_stone_fees`, `delete_stone_from_job`, and the Tranzila
payment routes. Now that everything funnels through `jobs_helpers`, this
test pins the contract so a future regression fails loudly in CI.
"""

import sys
from pathlib import Path

# Tests live in /app/backend/tests but import sibling modules at /app/backend.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jobs_helpers import (  # noqa: E402
    active_stones,
    sum_fees,
    sum_values,
    recompute_job_totals,
    payable_amount,
)


def _stone(**kw):
    """Test factory with sensible defaults."""
    base = {"id": "x", "value": 1000.0, "fee": 100.0}
    base.update(kw)
    return base


# --- active_stones ----------------------------------------------------------


def test_active_stones_filters_cancelled():
    job = {"stones": [_stone(), _stone(cancelled=True), _stone()]}
    assert len(active_stones(job)) == 2


def test_active_stones_accepts_raw_list():
    raw = [_stone(), _stone(cancelled=True)]
    assert active_stones(raw) == [raw[0]]


def test_active_stones_handles_missing_field():
    job = {"stones": [{"id": "a", "value": 5}, {"id": "b", "value": 5, "cancelled": False}]}
    assert len(active_stones(job)) == 2


def test_active_stones_handles_empty_job():
    assert active_stones({}) == []
    assert active_stones({"stones": []}) == []


# --- sum_fees / sum_values --------------------------------------------------


def test_sum_fees_uses_actual_fee_when_set():
    stones = [_stone(fee=100, actual_fee=80), _stone(fee=200)]
    assert sum_fees(stones) == 280.0


def test_sum_values_basic():
    assert sum_values([_stone(value=1000), _stone(value=2500)]) == 3500.0


# --- recompute_job_totals ---------------------------------------------------


def test_recompute_totals_simple():
    stones = [_stone(value=1000, fee=100), _stone(value=2000, fee=150)]
    totals = recompute_job_totals(stones)
    assert totals == {"total_stones": 2, "total_value": 3000.0, "total_fee": 250.0}


def test_recompute_totals_empty():
    assert recompute_job_totals([]) == {"total_stones": 0, "total_value": 0.0, "total_fee": 0.0}


def test_recompute_totals_dedupes_mounted_fee_within_a_group():
    """Mounted fee is paid once per certificate group, regardless of stone count."""
    stones = [
        # 3 mounted stones sharing certificate_group=1 → mounted fee counted ONCE
        _stone(value=1000, fee=100, mounted=True, certificate_group=1),
        _stone(value=1000, fee=100, mounted=True, certificate_group=1),
        _stone(value=1000, fee=100, mounted=True, certificate_group=1),
    ]
    # Without mounted_fee: 3 * 100 = 300
    assert recompute_job_totals(stones)["total_fee"] == 300.0
    # With mounted_fee=50: should subtract (3-1)*50 = 100  →  300 - 100 = 200
    assert recompute_job_totals(stones, mounted_fee=50)["total_fee"] == 200.0


def test_recompute_totals_does_not_dedupe_mounted_outside_a_group():
    stones = [
        _stone(value=1000, fee=100, mounted=True),  # no certificate_group
        _stone(value=1000, fee=100, mounted=True),
    ]
    # No certificate group → each stone's mounted fee stays included.
    assert recompute_job_totals(stones, mounted_fee=50)["total_fee"] == 200.0


# --- payable_amount ---------------------------------------------------------


def test_payable_amount_excludes_cancelled_stones():
    """The core regression: cancelled stones must NOT bill the customer."""
    job = {
        "stones": [
            _stone(fee=700),
            _stone(fee=800, cancelled=True),
        ],
    }
    assert payable_amount(job) == 700.0


def test_payable_amount_applies_discount():
    job = {"stones": [_stone(fee=500)], "discount": 50}
    assert payable_amount(job) == 450.0


def test_payable_amount_floors_at_zero():
    job = {"stones": [_stone(fee=100)], "discount": 999}
    assert payable_amount(job) == 0.0


def test_payable_amount_honors_adjustment_override():
    """When `payment_adjustment` is set, the manual amount takes precedence."""
    job = {
        "stones": [_stone(fee=10_000)],
        "payment_adjustment": True,
        "payment_adjustment_amount": 25,
    }
    assert payable_amount(job) == 25.0


def test_payable_amount_uses_actual_fee_when_present():
    job = {"stones": [_stone(fee=100, actual_fee=80)]}
    assert payable_amount(job) == 80.0
