from fastapi import APIRouter, Depends
from typing import Optional

from database import db
from auth import get_current_user

router = APIRouter()


@router.get("/dashboard/stats")
async def get_dashboard_stats(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if user["role"] == "branch_admin":
        query["branch_id"] = user.get("branch_id")
    elif user["role"] == "super_admin" and branch_id:
        query["branch_id"] = branch_id
    elif user["role"] == "customer":
        user_client_id = user.get("client_id")
        if user_client_id:
            query["client_id"] = user_client_id
        else:
            client = await db.clients.find_one({"email": user["email"]})
            if client:
                query["client_id"] = str(client["_id"])

    total_jobs = await db.jobs.count_documents(query)
    active_jobs = await db.jobs.count_documents({**query, "status": {"$nin": ["delivered"]}})

    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": None,
            "total_value": {"$sum": "$total_value"},
            "total_fee": {"$sum": "$total_fee"},
            "total_stones": {"$sum": "$total_stones"}
        }}
    ]

    agg_result = await db.jobs.aggregate(pipeline).to_list(1)
    totals = agg_result[0] if agg_result else {"total_value": 0, "total_fee": 0, "total_stones": 0}

    status_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_result = await db.jobs.aggregate(status_pipeline).to_list(20)
    status_breakdown = {s["_id"]: s["count"] for s in status_result}

    client_query = {}
    if user["role"] == "branch_admin":
        client_query["branch_id"] = user.get("branch_id")
    elif user["role"] == "super_admin" and branch_id:
        client_query["branch_id"] = branch_id

    if user["role"] == "customer":
        total_clients = 1
    else:
        total_clients = await db.clients.count_documents(client_query)

    return {
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "total_value": totals.get("total_value", 0),
        "total_fee": totals.get("total_fee", 0),
        "total_stones": totals.get("total_stones", 0),
        "total_clients": total_clients,
        "jobs_by_status": status_breakdown
    }
