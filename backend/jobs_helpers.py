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

Parcels (Feb 25, 2026):
A stone row with `kind == "parcel"` represents N physical stones rolled up
under one certificate. `stone_count` holds N (>=2). `weight` / `value` are
totals. For job-level counts we surface BOTH "physical stones" (sum of
stone_count) and "certificates" (row count) — the dashboard wants
"8 stones, 4 certificates" when a parcel is involved.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional


def is_parcel(stone: dict) -> bool:
    """True if this row is a parcel (one cert covering N stones)."""
    return stone.get("kind") == "parcel"


def physical_stone_count(stone: dict) -> int:
    """Number of physical stones this row represents.

    Single stones count as 1. Parcels count as their `stone_count`. Missing
    or invalid `stone_count` on a parcel row degrades gracefully to 1 so we
    can never silently halve a customer's totals.
    """
    if is_parcel(stone):
        try:
            n = int(stone.get("stone_count") or 1)
        except (TypeError, ValueError):
            n = 1
        return max(1, n)
    return 1


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
    """Build the `{total_stones, total_certificates, total_value, total_fee}`
    set for a job.

    - `total_stones` counts **physical** stones (parcels contribute their
      `stone_count`, single stones contribute 1). This is what the user
      thinks of as "how many gems were processed".
    - `total_certificates` is the row count (parcels and singles each count
      as one) — i.e. how many certificates the job will produce.

    The caller is responsible for passing **active stones only** (use
    `active_stones(job)`). Doing the filter in here would make the
    `$inc`-based hot path in `add_stone_to_job` awkward, so we keep the
    contract explicit at the call site.

    `mounted_fee` (optional): when provided, deducts duplicate mounted
    surcharges for stones that share a certificate group — the existing
    behaviour of `update_stone_fees` where the mounted fee is paid once
    per group, regardless of how many stones are mounted within it. Parcels
    are never grouped, so the dedup logic does not affect them.
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
        "total_stones": sum(physical_stone_count(s) for s in stones_list),
        "total_certificates": len(stones_list),
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
