from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime
import os
import time
import logging

import cloudinary
import cloudinary.utils
import cloudinary.uploader

from auth import require_admin
from models import CloudinaryDeleteRequest

logger = logging.getLogger(__name__)

ALLOWED_FOLDER_PREFIXES = ("certificates", "memos", "uploads", "invoices")

router = APIRouter()


@router.get("/cloudinary/signature")
async def generate_cloudinary_signature(
    resource_type: str = Query("image", enum=["image", "raw"]),
    folder: str = Query("uploads"),
    user: dict = Depends(require_admin)
):
    """Generate a signed upload signature for Cloudinary."""
    folder_base = folder.split('/')[0] if '/' in folder else folder.rstrip('/')
    if folder_base not in ALLOWED_FOLDER_PREFIXES:
        raise HTTPException(status_code=400, detail="Invalid folder path")

    timestamp = int(time.time())
    params = {
        "timestamp": timestamp,
        "folder": folder,
        "type": "upload",
    }

    signature = cloudinary.utils.api_sign_request(
        params,
        os.getenv("CLOUDINARY_API_SECRET")
    )

    return {
        "signature": signature,
        "timestamp": timestamp,
        "cloud_name": os.getenv("CLOUDINARY_CLOUD_NAME"),
        "api_key": os.getenv("CLOUDINARY_API_KEY"),
        "folder": folder,
        "resource_type": resource_type,
        "type": "upload"
    }


@router.post("/cloudinary/delete")
async def delete_cloudinary_file(request: CloudinaryDeleteRequest, user: dict = Depends(require_admin)):
    """Delete a file from Cloudinary"""
    try:
        result = cloudinary.uploader.destroy(
            request.public_id,
            resource_type=request.resource_type,
            invalidate=True
        )
        return {"message": "File deleted", "result": result}
    except Exception as e:
        logger.error(f"Cloudinary delete error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")
