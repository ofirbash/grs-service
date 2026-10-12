from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from pydantic import BaseModel

from database import db
from auth import get_current_user, require_admin
from models import PricingUpdateRequest
from pricing import normalize_bracket, PRICING_BRACKETS, COLOR_STABILITY_FEE
from expected_dates import DEFAULT_TURNAROUND_DAYS

DEFAULT_STONE_TYPES = ['Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Alexandrite', 'Spinel', 'Padparadscha', 'Paraiba', 'Tanzanite', 'Other']
DEFAULT_SHAPES = ['Round', 'Oval', 'Cushion', 'Pear', 'Heart', 'Marquise', 'Princess', 'Emerald Cut', 'Cabochon', 'Other']

# Recheck reasons (Feb 25, 2026). When a job's service_type is "Recheck",
# the user must pick one or more of these reasons to document why the
# stone(s) are being re-examined. Admins can edit the list via
# Settings → Recheck Reasons. Defaults mirror the four verbal-finding fields
# that are typically the subject of a recheck.
DEFAULT_RECHECK_REASONS = ["Origin", "Color", "Identification", "Comment"]
DEFAULT_PRECIOUS_STONE_TYPES = ["Ruby", "Sapphire", "Emerald"]


router = APIRouter()


DEFAULT_PAYMENT_DESTINATIONS = [
    "Bank Wire – Leumi",
    "Bank Wire – Hapoalim",
    "Cash – Israel Office",
    "Cash – HK Office",
]

# Initial courier list. Stored in pricing_config.couriers once the admin saves
# any change in Settings → Couriers; until then, the API serves these defaults.
DEFAULT_COURIERS = [
    "UPS",
    "FedEx",
    "DHL",
    "TNT",
    "Aramex",
    "Local Courier",
    "Hand Carry",
    "Other",
]


@router.get("/pricing")
async def get_pricing_config(user: dict = Depends(get_current_user)):
    """Get pricing configuration from database or defaults"""
    pricing = await db.pricing_config.find_one({"type": "pricing"})

    if pricing:
        raw_brackets = pricing.get("brackets", [])
        brackets = [normalize_bracket(b) for b in raw_brackets]
        return {
            "brackets": brackets,
            "color_stability_fee": pricing.get("color_stability_fee", COLOR_STABILITY_FEE),
            "mounted_jewellery_fee": pricing.get("mounted_jewellery_fee", 50),
            "service_types": pricing.get("service_types", ["Express", "Normal", "Recheck"]),
            "stone_types": pricing.get("stone_types", DEFAULT_STONE_TYPES),
            "shapes": pricing.get("shapes", DEFAULT_SHAPES),
            "payment_destinations": pricing.get("payment_destinations", DEFAULT_PAYMENT_DESTINATIONS),
            "couriers": pricing.get("couriers", DEFAULT_COURIERS),
            "recheck_reasons": pricing.get("recheck_reasons", DEFAULT_RECHECK_REASONS),
            "service_turnaround_days": pricing.get("service_turnaround_days", DEFAULT_TURNAROUND_DAYS),
            "precious_stone_types": pricing.get("precious_stone_types", DEFAULT_PRECIOUS_STONE_TYPES),
        }

    brackets = [normalize_bracket(b) for b in PRICING_BRACKETS]
    return {
        "brackets": brackets,
        "color_stability_fee": COLOR_STABILITY_FEE,
        "mounted_jewellery_fee": 50,
        "service_types": ["Express", "Normal", "Recheck"],
        "stone_types": DEFAULT_STONE_TYPES,
        "shapes": DEFAULT_SHAPES,
        "payment_destinations": DEFAULT_PAYMENT_DESTINATIONS,
        "couriers": DEFAULT_COURIERS,
        "recheck_reasons": DEFAULT_RECHECK_REASONS,
        "service_turnaround_days": DEFAULT_TURNAROUND_DAYS,
        "precious_stone_types": DEFAULT_PRECIOUS_STONE_TYPES,
    }


@router.put("/pricing")
async def update_pricing_config(data: PricingUpdateRequest, user: dict = Depends(require_admin)):
    """Update pricing configuration"""
    update_data = {
        "brackets": data.brackets,
        "color_stability_fee": data.color_stability_fee,
        "mounted_jewellery_fee": data.mounted_jewellery_fee,
        "service_types": data.service_types,
        "updated_at": datetime.utcnow()
    }
    if data.stone_types is not None:
        update_data["stone_types"] = data.stone_types
    if data.shapes is not None:
        update_data["shapes"] = data.shapes
    if data.payment_destinations is not None:
        update_data["payment_destinations"] = data.payment_destinations
    if data.couriers is not None:
        update_data["couriers"] = data.couriers
    if data.recheck_reasons is not None:
        update_data["recheck_reasons"] = data.recheck_reasons

    # Keep turnaround keys / precious list in sync with the current type lists
    # so a removed-then-re-added type starts fresh (no turnaround, Semi-Precious).
    existing = await db.pricing_config.find_one({"type": "pricing"}) or {}
    stone_types = update_data.get("stone_types", existing.get("stone_types", DEFAULT_STONE_TYPES))
    turnaround = data.service_turnaround_days
    if turnaround is None:
        turnaround = existing.get("service_turnaround_days", DEFAULT_TURNAROUND_DAYS)
    update_data["service_turnaround_days"] = {
        k: (int(v) if v is not None and v >= 0 else None)
        for k, v in turnaround.items() if k in data.service_types
    }
    precious = data.precious_stone_types
    if precious is None:
        precious = existing.get("precious_stone_types", DEFAULT_PRECIOUS_STONE_TYPES)
    update_data["precious_stone_types"] = [t for t in precious if t in stone_types]

    await db.pricing_config.update_one(
        {"type": "pricing"},
        {"$set": update_data},
        upsert=True
    )

    return {"message": "Pricing configuration updated successfully"}


class RenameServiceTypeRequest(BaseModel):
    old_name: str
    new_name: str


@router.post("/pricing/rename-service-type")
async def rename_service_type(data: RenameServiceTypeRequest, user: dict = Depends(require_admin)):
    """Rename a service type everywhere it's referenced.

    Why this exists: the chip-delete UI hides the `×` for service types that
    have existing jobs (to prevent orphaning). That makes renaming via
    delete+add impossible. This endpoint does the rename atomically in one
    place:

      1. `pricing_config.service_types` list — swap the entry, preserve order.
      2. `pricing_config.brackets[*].fees` — every per-bracket fee dict gets
         its old key renamed to the new key.
      3. `jobs` collection — every job whose `service_type == old_name` is
         updated to the new name. This is the critical step that lets the
         user merge a typo'd or legacy service type into the canonical one
         (e.g. `"Recheck Type"` → `"Recheck"`).

    Idempotent enough for safety: if the new name already exists in the
    list, the old entry is removed (deduped) instead of producing a
    duplicate; the rename of jobs still runs so the merge happens. We
    bail out only if old_name == new_name or old_name doesn't exist in
    the current service_types list.
    """
    old_name = (data.old_name or "").strip()
    new_name = (data.new_name or "").strip()
    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name are required")
    if old_name == new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name are identical")

    pricing = await db.pricing_config.find_one({"type": "pricing"})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing config not initialised")

    service_types = list(pricing.get("service_types", []))
    if old_name not in service_types:
        raise HTTPException(
            status_code=404,
            detail=f"Service type '{old_name}' not found in pricing config",
        )

    # Build the new service_types list. If the new name already exists,
    # drop the old entry (effectively merging the two). Otherwise replace
    # the old name with the new one in place to preserve order.
    if new_name in service_types:
        service_types = [t for t in service_types if t != old_name]
    else:
        service_types = [new_name if t == old_name else t for t in service_types]

    # Rename the key in every bracket's fees dict.
    new_brackets = []
    for b in pricing.get("brackets", []):
        fees = dict(b.get("fees", {}))
        if old_name in fees:
            old_fee = fees.pop(old_name)
            # If both keys existed (rare — only if pricing was previously
            # corrupted), keep whichever already had the higher value rather
            # than silently overwriting.
            if new_name in fees:
                fees[new_name] = max(fees[new_name] or 0, old_fee or 0)
            else:
                fees[new_name] = old_fee
        new_brackets.append({**b, "fees": fees})

    turnaround = dict(pricing.get("service_turnaround_days", DEFAULT_TURNAROUND_DAYS))
    if old_name in turnaround:
        old_days = turnaround.pop(old_name)
        turnaround.setdefault(new_name, old_days)

    await db.pricing_config.update_one(
        {"type": "pricing"},
        {"$set": {
            "service_types": service_types,
            "service_turnaround_days": turnaround,
            "brackets": new_brackets,
            "updated_at": datetime.utcnow(),
        }},
    )

    # Migrate every job that was using the old service type.
    job_result = await db.jobs.update_many(
        {"service_type": old_name},
        {"$set": {"service_type": new_name, "updated_at": datetime.utcnow()}},
    )

    return {
        "message": f"Renamed '{old_name}' → '{new_name}'",
        "service_types": service_types,
        "jobs_updated": job_result.modified_count,
    }

