"""Single source of truth for job-total arithmetic.

Cancelled stones are soft-deleted: they stay on the job document for audit
purposes but **must not** contribute to `total_stones / total_value /
total_fee`, nor to any customer-facing fee / payment amount.

Multiple backend routes had to compute these totals independently and a few
forgot to filter out cancelled stones, which silently leaked the cancelled
stone's fee/value back into the job (and at one point into the amount the
customer was charged on Tranzila). Every route that touches job totals or
customer-payable amounts should call into this module instead of rolling
its own sum.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional


def active_stones(job_or_stones: Any) -> list[dict]:
    """Return only the stones that are NOT soft-cancelled.

    Accepts either a job document (dict with a `stones` field) or a raw
    list of stone dicts, so callers don't have to pre-extract the list.
    """
    if isinstance(job_or_stones, dict):
        stones = job_or_stones.get("stones", []) or []
    else:
        stones = list(job_or_stones or [])
    return [s for s in stones if not s.get("cancelled")]


def sum_fees(stones: Iterable[dict]) -> float:
    """Sum of fees over the given stones.

    Uses `actual_fee` when set (admin override) and falls back to `fee`.
    Mirrors the long-standing convention across `routes/payments.py`.
    """
    return sum(float(s.get("actual_fee") or s.get("fee", 0) or 0) for s in stones)


def sum_values(stones: Iterable[dict]) -> float:
    return sum(float(s.get("value", 0) or 0) for s in stones)


def recompute_job_totals(
    stones: Iterable[dict],
    *,
    mounted_fee: Optional[float] = None,
) -> dict[str, float]:
    """Build the `{total_stones, total_value, total_fee}` set for a job.

    The caller is responsible for passing **active stones only** (use
    `active_stones(job)`). Doing the filter in here would make the
    `$inc`-based hot path in `add_stone_to_job` awkward, so we keep the
    contract explicit at the call site.

    `mounted_fee` (optional): when provided, deducts duplicate mounted
    surcharges for stones that share a certificate group — the existing
    behaviour of `update_stone_fees` where the mounted fee is paid once
    per group, regardless of how many stones are mounted within it.
    """
    stones_list = list(stones)
    total_fee = sum(float(s.get("fee", 0) or 0) for s in stones_list)

    if mounted_fee:
        mounted_groups: dict[int, int] = {}
        for s in stones_list:
            if s.get("mounted") and s.get("certificate_group") is not None:
                g = s["certificate_group"]
                mounted_groups[g] = mounted_groups.get(g, 0) + 1
        for g, count in mounted_groups.items():
            if count > 1:
                total_fee -= (count - 1) * mounted_fee

    return {
        "total_stones": len(stones_list),
        "total_value": sum_values(stones_list),
        "total_fee": total_fee,
    }


def payable_amount(job: dict) -> float:
    """USD amount the customer owes for `job`, after discount.

    Respects the manual-adjustment escape hatch (`payment_adjustment_amount`)
    and excludes cancelled stones. Floors at zero so a discount larger than
    the fee can't produce a negative charge.
    """
    if job.get("payment_adjustment") and job.get("payment_adjustment_amount") is not None:
        return float(job["payment_adjustment_amount"])

    discount = float(job.get("discount", 0) or 0)
    fees = sum_fees(active_stones(job))
    return max(0.0, fees - discount)
