from database import db

PRICING_BRACKETS = [
    {"min": 0, "max": 9999.99, "fees": {"Express": 120, "Normal": 80, "Recheck": 40}},
    {"min": 10000, "max": 49999.99, "fees": {"Express": 200, "Normal": 150, "Recheck": 75}},
    {"min": 50000, "max": 199999.99, "fees": {"Express": 350, "Normal": 250, "Recheck": 125}},
    {"min": 200000, "max": 9999999.99, "fees": {"Express": 500, "Normal": 400, "Recheck": 200}},
]
COLOR_STABILITY_FEE = 50


def normalize_bracket(b):
    """Convert old-format bracket to new fees-dict format"""
    if "fees" in b:
        return b
    fees = {}
    if "express_fee" in b:
        fees["Express"] = b["express_fee"]
    elif "express" in b:
        fees["Express"] = b["express"]
    if "normal_fee" in b:
        fees["Normal"] = b["normal_fee"]
    elif "normal" in b:
        fees["Normal"] = b["normal"]
    if "recheck_fee" in b:
        fees["Recheck"] = b["recheck_fee"]
    elif "recheck" in b:
        fees["Recheck"] = b["recheck"]
    return {
        "min_value": b.get("min_value", b.get("min", 0)),
        "max_value": b.get("max_value", b.get("max", 0)),
        "fees": fees
    }


async def get_pricing_brackets_from_db():
    """Fetch pricing brackets from DB, with fallback to defaults"""
    pricing = await db.pricing_config.find_one({"type": "pricing"})
    if pricing and pricing.get("brackets"):
        return [normalize_bracket(b) for b in pricing["brackets"]]
    return [normalize_bracket(b) for b in PRICING_BRACKETS]


async def get_color_stability_fee_from_db():
    """Fetch color stability fee from DB"""
    pricing = await db.pricing_config.find_one({"type": "pricing"})
    if pricing:
        return pricing.get("color_stability_fee", COLOR_STABILITY_FEE)
    return COLOR_STABILITY_FEE


async def get_mounted_fee_from_db():
    """Fetch mounted jewellery fee from DB"""
    pricing = await db.pricing_config.find_one({"type": "pricing"})
    if pricing:
        return pricing.get("mounted_jewellery_fee", 50)
    return 50


def calculate_stone_fee_from_brackets(value: float, service_type: str, color_stability_test: bool, brackets: list, color_stability_fee: float = 50) -> float:
    """Calculate fee for a single stone using provided brackets"""
    fee = 0
    for bracket in brackets:
        b = normalize_bracket(bracket)
        min_val = b.get("min_value", b.get("min", 0))
        max_val = b.get("max_value", b.get("max", 0))
        if min_val <= value <= max_val:
            fees = b.get("fees", {})
            fee = fees.get(service_type, 0)
            if fee == 0:
                for k, v in fees.items():
                    if k.lower() == service_type.lower():
                        fee = v
                        break
            break

    if color_stability_test:
        fee += color_stability_fee

    return fee


def calculate_stone_fee(value: float, service_type: str, color_stability_test: bool) -> float:
    """Legacy sync fallback using hardcoded defaults"""
    return calculate_stone_fee_from_brackets(value, service_type, color_stability_test, PRICING_BRACKETS, COLOR_STABILITY_FEE)
