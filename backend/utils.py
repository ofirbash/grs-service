from io import BytesIO
import urllib.request

FULL_LOGO_URL = "https://customer-assets.emergentagent.com/job_stone-erp-mobile/artifacts/38z41zb2_bashari%20logo.png"
SQUARE_LOGO_URL = "https://customer-assets.emergentagent.com/job_stone-erp-mobile/artifacts/q4uw8qjo_bashari%20logo%20favicon.png"

STONE_TYPE_CODES = {
    "Ruby": "RU",
    "Sapphire": "SA",
    "Emerald": "EM",
    "Diamond": "DI",
    "Alexandrite": "AL",
    "Spinel": "SP",
    "Padparadscha": "PA",
    "Paraiba": "PR",
    "Tanzanite": "TZ",
    "Other": "OT"
}


def generate_sku(stone_type: str, weight: float, job_id: int, position: int) -> str:
    """Generate auto-SKU: [StoneTypeCode][WeightWithoutDecimal]J[JobID][StonePosition]"""
    type_code = STONE_TYPE_CODES.get(stone_type, "OT")
    weight_formatted = f"{weight:.2f}"
    weight_str = weight_formatted.replace(".", "")
    position_str = str(position).zfill(2)
    return f"{type_code}{weight_str}J{job_id}{position_str}"


def download_logo():
    """Download logo image for PDF generation"""
    try:
        with urllib.request.urlopen(FULL_LOGO_URL, timeout=10) as response:
            return BytesIO(response.read())
    except:
        return None
