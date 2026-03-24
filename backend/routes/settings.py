from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from datetime import datetime
from bson import ObjectId

from database import db
from auth import get_current_user, require_admin
from models import DropdownOption

router = APIRouter()


@router.get("/settings/dropdowns")
async def get_dropdown_settings(user: dict = Depends(get_current_user)):
    """Get all dropdown settings for verbal findings"""
    settings = await db.dropdown_settings.find_one({"type": "verbal_findings"})

    if not settings:
        return {
            "identification": [],
            "color": [],
            "origin": [],
            "comment": []
        }

    return {
        "identification": settings.get("identification", []),
        "color": settings.get("color", []),
        "origin": settings.get("origin", []),
        "comment": settings.get("comment", [])
    }


@router.put("/settings/dropdowns/{field_name}")
async def update_dropdown_settings(field_name: str, options: List[dict] = Body(...), user: dict = Depends(require_admin)):
    """Update dropdown options for a specific field with stone type mapping"""
    if field_name not in ["identification", "color", "origin", "comment"]:
        raise HTTPException(status_code=400, detail="Invalid field name")

    dropdown_options = []
    for opt in options:
        if isinstance(opt, str):
            dropdown_options.append({"value": opt, "stone_types": ["all"]})
        elif isinstance(opt, dict):
            dropdown_options.append({
                "value": opt.get("value", ""),
                "stone_types": opt.get("stone_types", ["all"])
            })

    await db.dropdown_settings.update_one(
        {"type": "verbal_findings"},
        {"$set": {field_name: dropdown_options, "updated_at": datetime.utcnow()}},
        upsert=True
    )

    return {"message": f"{field_name} options updated successfully"}


@router.post("/settings/dropdowns/initialize")
async def initialize_dropdown_settings(user: dict = Depends(require_admin)):
    """Initialize dropdown settings with default values"""

    default_settings = {
        "type": "verbal_findings",
        "identification": [
            {"value": "NATURAL RUBY", "stone_types": ["all"]},
            {"value": "NATURAL SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL EMERALD", "stone_types": ["all"]},
            {"value": "NATURAL SPINEL", "stone_types": ["all"]},
            {"value": "NATURAL TANZANITE", "stone_types": ["all"]},
            {"value": "NATURAL TOURMALINE", "stone_types": ["all"]},
            {"value": "NATURAL AQUAMARINE (-BERYL)", "stone_types": ["all"]},
            {"value": "NATURAL CHRYSOBERYL", "stone_types": ["all"]},
            {"value": "NATURAL CATS EYE CHRYSOBERYL", "stone_types": ["all"]},
            {"value": "NATURAL STAR RUBY", "stone_types": ["all"]},
            {"value": "NATURAL STAR SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PINK SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL YELLOW SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL ORANGE SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL FANCY SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL COLOR-CHANGING SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PURPLISH-PINK SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PINKISH ORANGE SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL GREENISH-BLUE SAPPHIRE", "stone_types": ["all"]},
            {"value": "NATURAL PINKISH RED RUBY", "stone_types": ["all"]},
            {"value": "NATURAL GARNET (SPESSARTINE)", "stone_types": ["all"]},
            {"value": "NATURAL TOURMALINE (CUPRIAN-ELBAITE)", "stone_types": ["all"]},
            {"value": "NATURAL TOURMALINE (RUBELITE)", "stone_types": ["all"]},
            {"value": "NATURAL IMPERIAL TOPAZ", "stone_types": ["all"]},
            {"value": "NATURAL ZIRCON", "stone_types": ["all"]},
            {"value": "NATURAL KORNERUPINE", "stone_types": ["all"]},
            {"value": "TREATED RUBY", "stone_types": ["all"]},
            {"value": "TREATED SAPPHIRE", "stone_types": ["all"]},
            {"value": "TREATED TOURMALINE", "stone_types": ["all"]},
            {"value": "LEAD-GLASS TREATED NATURAL RUBY", "stone_types": ["all"]},
            {"value": "SYNTHETIC RUBY", "stone_types": ["all"]},
            {"value": "SYNTHETIC SAPPHIRE", "stone_types": ["all"]},
            {"value": "SYNTHETIC SPINEL", "stone_types": ["all"]},
            {"value": "SYNTHETIC ALEXANDRITE (-CHRYSOBERYL)", "stone_types": ["all"]},
            {"value": "GARNET TOPPED DOUBLET", "stone_types": ["all"]},
        ],
        "color": [
            {"value": "RED", "stone_types": ["all"]},
            {"value": "VIVID RED", "stone_types": ["all"]},
            {"value": "DEEP RED", "stone_types": ["all"]},
            {"value": "VIVID RED PIGEON BLOOD", "stone_types": ["all"]},
            {"value": "VIVID TO DEEP RED PIGEON BLOOD", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID RED PIGEON BLOOD", "stone_types": ["all"]},
            {"value": "PINKISH RED", "stone_types": ["all"]},
            {"value": "PURPLISH-PINK", "stone_types": ["all"]},
            {"value": "BLUE", "stone_types": ["all"]},
            {"value": "VIVID BLUE", "stone_types": ["all"]},
            {"value": "DEEP BLUE", "stone_types": ["all"]},
            {"value": "VIVID BLUE ROYAL BLUE", "stone_types": ["all"]},
            {"value": "VIVID TO DEEP BLUE ROYAL BLUE", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID BLUE ROYAL BLUE", "stone_types": ["all"]},
            {"value": "PASTEL BLUE", "stone_types": ["all"]},
            {"value": "VIOLETISH-BLUE", "stone_types": ["all"]},
            {"value": "GREENISH-BLUE", "stone_types": ["all"]},
            {"value": "GREENISH-BLUE PARAIBA", "stone_types": ["all"]},
            {"value": "GREEN", "stone_types": ["all"]},
            {"value": "VIVID GREEN", "stone_types": ["all"]},
            {"value": "VIVID GREEN MUZO GREEN", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID GREEN", "stone_types": ["all"]},
            {"value": "YELLOW", "stone_types": ["all"]},
            {"value": "VIVID YELLOW", "stone_types": ["all"]},
            {"value": "INTENSE TO VIVID YELLOW", "stone_types": ["all"]},
            {"value": "ORANGE", "stone_types": ["all"]},
            {"value": "VIVID ORANGE", "stone_types": ["all"]},
            {"value": "PINKISH ORANGE", "stone_types": ["all"]},
            {"value": "YELLOWISH-ORANGE", "stone_types": ["all"]},
            {"value": "PINK", "stone_types": ["all"]},
            {"value": "VIVID PINK", "stone_types": ["all"]},
            {"value": "PURPLE-RED", "stone_types": ["all"]},
            {"value": "PURPLISH-RED", "stone_types": ["all"]},
            {"value": "COLOR-CHANGING FROM BLUE TO PURPLE", "stone_types": ["all"]},
            {"value": "COLOR-CHANGING FROM VIOLETISH-BLUE TO PURPLE", "stone_types": ["all"]},
        ],
        "origin": [
            {"value": "NO ORIGIN", "stone_types": ["all"]},
            {"value": "BURMA (MYANMAR)", "stone_types": ["all"]},
            {"value": "BURMA (MOGOK)", "stone_types": ["all"]},
            {"value": "SRI LANKA", "stone_types": ["all"]},
            {"value": "MADAGASCAR", "stone_types": ["all"]},
            {"value": "MOZAMBIQUE", "stone_types": ["all"]},
            {"value": "THAILAND", "stone_types": ["all"]},
            {"value": "COLOMBIA", "stone_types": ["all"]},
            {"value": "ZAMBIA", "stone_types": ["all"]},
            {"value": "BRAZIL", "stone_types": ["all"]},
            {"value": "TANZANIA", "stone_types": ["all"]},
            {"value": "KASHMIR (INDIA)", "stone_types": ["all"]},
            {"value": "AFGHANISTAN (PANJSHIR)", "stone_types": ["all"]},
            {"value": "ETHIOPIA", "stone_types": ["all"]},
            {"value": "EAST-AFRICA", "stone_types": ["all"]},
            {"value": "URAL (RUSSIA)", "stone_types": ["all"]},
            {"value": "HIMALAYAN MOUNTAINS", "stone_types": ["all"]},
            {"value": "KANCHANABURI (THAILAND)", "stone_types": ["all"]},
            {"value": "UMBA (TANZANIA)", "stone_types": ["all"]},
        ],
        "comment": [
            {"value": "NONE", "stone_types": ["all"]},
            {"value": "NO INDICATION OF TREATMENT", "stone_types": ["all"]},
            {"value": "NO INDICATION OF THERMAL TREATMENT", "stone_types": ["all"]},
            {"value": "HEATED", "stone_types": ["all"]},
            {"value": "H(a)", "stone_types": ["all"]},
            {"value": "H(b)", "stone_types": ["all"]},
            {"value": "H, LIBS-tested", "stone_types": ["all"]},
            {"value": "H(a), LIBS-tested", "stone_types": ["all"]},
            {"value": "H(b), LIBS-tested", "stone_types": ["all"]},
            {"value": "INSIGNIFICANT", "stone_types": ["all"]},
            {"value": "MINOR", "stone_types": ["all"]},
            {"value": "MINOR TO MODERATE", "stone_types": ["all"]},
            {"value": "MODERATE", "stone_types": ["all"]},
            {"value": "MINOR TO MODERATE (HARDENED RESIN)", "stone_types": ["all"]},
            {"value": "NO HEATED", "stone_types": ["all"]},
            {"value": "NO HEATED (OIL)", "stone_types": ["all"]},
            {"value": "FTIR-tested", "stone_types": ["all"]},
            {"value": "PHT", "stone_types": ["all"]},
            {"value": "APPLICATION OF TREATMENT UNDETERMINABLE", "stone_types": ["all"]},
            {"value": "Heat-treated and clarity-enhanced with foreign substance", "stone_types": ["all"]},
            {"value": "H, Special comment see appendix", "stone_types": ["all"]},
            {"value": "NO COMMENT", "stone_types": ["all"]},
        ],
        "updated_at": datetime.utcnow()
    }

    existing = await db.dropdown_settings.find_one({"type": "verbal_findings"})
    if existing:
        return {"message": "Settings already initialized", "action": "none"}

    await db.dropdown_settings.insert_one(default_settings)
    return {"message": "Dropdown settings initialized successfully"}
