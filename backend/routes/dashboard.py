from fastapi import APIRouter, Depends
from typing import Optional

from database import db
from auth import get_current_user

router = APIRouter()


async def _build_jobs_query(user: dict, branch_id: Optional[str]) -> dict:
    """Return a Mongo query dict scoped to the user's role."""
    role = user["role"]
    if role == "branch_admin":
        return {"branch_id": user.get("branch_id")}
    if role == "super_admin" and branch_id:
        return {"branch_id": branch_id}
    if role == "customer":
        client_id = user.get("client_id")
        if not client_id:
            client = await db.clients.find_one({"email": user["email"]})
            if client:
                client_id = str(client["_id"])
        return {"client_id": client_id} if client_id else {}
    return {}


async def _aggregate_job_totals(query: dict) -> dict:
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": None,
            "total_value": {"$sum": "$total_value"},
            "total_fee": {"$sum": "$total_fee"},
            "total_stones": {"$sum": "$total_stones"},
        }},
    ]
    result = await db.jobs.aggregate(pipeline).to_list(1)
    return result[0] if result else {"total_value": 0, "total_fee": 0, "total_stones": 0}


async def _aggregate_status_breakdown(query: dict) -> dict:
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    result = await db.jobs.aggregate(pipeline).to_list(20)
    return {s["_id"]: s["count"] for s in result}


async def _count_clients(user: dict, branch_id: Optional[str]) -> int:
    if user["role"] == "customer":
        return 1
    client_query = {}
    if user["role"] == "branch_admin":
        client_query["branch_id"] = user.get("branch_id")
    elif user["role"] == "super_admin" and branch_id:
        client_query["branch_id"] = branch_id
    return await db.clients.count_documents(client_query)


@router.get("/dashboard/stats")
async def get_dashboard_stats(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = await _build_jobs_query(user, branch_id)

    total_jobs = await db.jobs.count_documents(query)
    active_jobs = await db.jobs.count_documents({**query, "status": {"$nin": ["delivered"]}})
    totals = await _aggregate_job_totals(query)
    status_breakdown = await _aggregate_status_breakdown(query)
    total_clients = await _count_clients(user, branch_id)

    return {
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "total_value": totals.get("total_value", 0),
        "total_fee": totals.get("total_fee", 0),
        "total_stones": totals.get("total_stones", 0),
        "total_clients": total_clients,
        "jobs_by_status": status_breakdown,
    }


@router.get("/dashboard/clients-with-active-jobs")
async def get_clients_with_active_jobs(branch_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get clients that have at least one job not in 'done' status"""
    if user["role"] not in ["super_admin", "branch_admin"]:
        return []

    match_query: dict = {"status": {"$ne": "done"}}
    if user["role"] == "branch_admin":
        match_query["branch_id"] = user.get("branch_id")
    elif branch_id:
        match_query["branch_id"] = branch_id

    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": "$client_id",
            "active_jobs": {"$sum": 1},
            "total_stones": {"$sum": "$total_stones"},
            "total_fee": {"$sum": "$total_fee"},
            "statuses": {"$push": "$status"},
        }},
        {"$sort": {"active_jobs": -1}},
    ]

    results = await db.jobs.aggregate(pipeline).to_list(200)

    client_ids_str = [r["_id"] for r in results if r["_id"]]
    from bson import ObjectId as ObjId
    client_ids_obj = []
    for cid in client_ids_str:
        try:
            client_ids_obj.append(ObjId(cid))
        except Exception:
            pass

    clients = await db.clients.find({"_id": {"$in": client_ids_obj}}).to_list(200)
    client_map = {str(c["_id"]): c for c in clients}

    output = []
    for r in results:
        c = client_map.get(r["_id"])
        if not c:
            continue
        output.append({
            "id": str(c["_id"]),
            "name": c.get("name", ""),
            "email": c.get("email", ""),
            "company": c.get("company", ""),
            "active_jobs": r["active_jobs"],
            "total_stones": r["total_stones"],
            "total_fee": r["total_fee"],
            "statuses": r["statuses"],
        })

    return output
