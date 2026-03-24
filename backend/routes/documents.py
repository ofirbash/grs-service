from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from bson import ObjectId
import uuid

from database import db
from auth import get_current_user, require_admin
from models import DocumentUpload

router = APIRouter()


@router.post("/jobs/{job_id}/documents")
async def upload_document(job_id: str, document: DocumentUpload, user: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    doc_entry = {
        "id": str(uuid.uuid4()),
        "document_type": document.document_type,
        "stone_id": document.stone_id,
        "filename": document.filename,
        "file_base64": document.file_base64,
        "uploaded_by": user["full_name"],
        "uploaded_at": datetime.utcnow()
    }

    if document.stone_id and document.document_type == "certificate_scan":
        await db.jobs.update_one(
            {"_id": ObjectId(job_id), "stones.id": document.stone_id},
            {"$set": {"stones.$.certificate_scan": document.file_base64}}
        )

    await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {
            "$push": {"documents": doc_entry},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    return {"message": "Document uploaded successfully", "document_id": doc_entry["id"]}


@router.get("/jobs/{job_id}/documents")
async def get_job_documents(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job.get("documents", [])
