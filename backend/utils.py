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
    """Download landscape logo image for PDF generation."""
    try:
        with urllib.request.urlopen(FULL_LOGO_URL, timeout=10) as response:
            return BytesIO(response.read())
    except Exception:
        return None


def download_square_logo():
    """Download the square "B" mark used in invoice header/footer.

    Prefers the local copy bundled into `backend/assets/` so PDF rendering
    works even when outbound network is blocked. Falls back to the CDN URL.
    """
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    local = os.path.join(here, "assets", "bashari-square.png")
    if os.path.exists(local):
        with open(local, "rb") as f:
            return BytesIO(f.read())
    try:
        with urllib.request.urlopen(SQUARE_LOGO_URL, timeout=10) as response:
            return BytesIO(response.read())
    except Exception:
        return None
