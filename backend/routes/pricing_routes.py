from fastapi import APIRouter, Depends
from datetime import datetime

from database import db
from auth import get_current_user, require_admin
from models import PricingUpdateRequest
from pricing import normalize_bracket, PRICING_BRACKETS, COLOR_STABILITY_FEE

DEFAULT_STONE_TYPES = ['Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Alexandrite', 'Spinel', 'Padparadscha', 'Paraiba', 'Tanzanite', 'Other']
DEFAULT_SHAPES = ['Round', 'Oval', 'Cushion', 'Pear', 'Heart', 'Marquise', 'Princess', 'Emerald Cut', 'Cabochon', 'Other']

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

    await db.pricing_config.update_one(
        {"type": "pricing"},
        {"$set": update_data},
        upsert=True
    )

    return {"message": "Pricing configuration updated successfully"}
