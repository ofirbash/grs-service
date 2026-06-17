"""Tests for pickup_events (memo_return + cert_collection flows).

Run: `pytest backend/tests/test_pickups.py -q`.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime
from typing import Any

import pytest

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from database import db  # noqa: E402
import routes.pickups as pickups_routes  # noqa: E402


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def seeded():
    """Job with 3 active stones + 1 cancelled, plus a super_admin user."""
    suffix = uuid.uuid4().hex[:6]
    now = datetime.utcnow()
    admin = {
        "email": f"pickup-test-{suffix}@example.com",
        "full_name": "Pickup Test Admin",
        "role": "super_admin",
        "branch_id": None,
        "created_at": now,
    }
    admin_id = _run(db.users.insert_one(admin)).inserted_id
    admin["_id"] = admin_id

    job: dict[str, Any] = {
        "job_number": 92001,
        "client_id": str(uuid.uuid4()),
        "branch_id": "branch-test",
        "service_type": "Normal",
        "status": "stones_accepted",
        "stones": [
            {"id": "stone-1", "sku": "S001", "stone_type": "Diamond", "weight": 1.0,
             "shape": "Round", "value": 5000, "stone_status": "at_office"},
            {"id": "stone-2", "sku": "S002", "stone_type": "Sapphire", "weight": 2.0,
             "shape": "Oval", "value": 3000, "stone_status": "at_office",
             "certificate_group": 1, "certificate_scan_url": "https://cdn/1.png"},
            {"id": "stone-3", "sku": "S003", "stone_type": "Emerald", "weight": 1.5,
             "shape": "Pear", "value": 4000, "stone_status": "at_office",
             "certificate_group": 1, "certificate_scan_url": "https://cdn/1.png"},
            {"id": "stone-4", "sku": "S004", "stone_type": "Ruby", "weight": 0.5,
             "shape": "Princess", "value": 1000, "cancelled": True},
        ],
        "created_at": now,
        "updated_at": now,
    }
    job_id = _run(db.jobs.insert_one(job)).inserted_id

    yield {"admin": admin, "job_id": str(job_id)}

    _run(db.pickup_events.delete_many({"job_id": str(job_id)}))
    _run(db.activity_log.delete_many({"job_id": str(job_id)}))
    _run(db.jobs.delete_one({"_id": job_id}))
    _run(db.users.delete_one({"_id": admin_id}))


def _payload(job_id: str, stone_ids, type_="memo_return"):
    return pickups_routes.CreatePickupPayload(
        job_id=job_id, type=type_, stone_ids=stone_ids,
    )


class TestCreatePickup:
    def test_memo_return_records_and_flips_status(self, seeded):
        res = _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-1", "stone-2"], "memo_return"),
            user=seeded["admin"],
        ))
        assert res["type"] == "memo_return"
        assert set(res["stone_ids"]) == {"stone-1", "stone-2"}

        # Stone status flipped to 'returned' for both.
        job = _run(db.jobs.find_one({"_id": pickups_routes._oid(seeded["job_id"])}))
        statuses = {s["id"]: s.get("stone_status") for s in job["stones"]}
        assert statuses["stone-1"] == "returned"
        assert statuses["stone-2"] == "returned"
        assert statuses["stone-3"] == "at_office"  # untouched

    def test_cert_collection_does_not_flip_stone_status(self, seeded):
        _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-2", "stone-3"], "cert_collection"),
            user=seeded["admin"],
        ))
        job = _run(db.jobs.find_one({"_id": pickups_routes._oid(seeded["job_id"])}))
        statuses = {s["id"]: s.get("stone_status") for s in job["stones"]}
        assert statuses["stone-2"] == "at_office"
        assert statuses["stone-3"] == "at_office"

    def test_double_pickup_blocked(self, seeded):
        _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-1"], "memo_return"),
            user=seeded["admin"],
        ))
        with pytest.raises(Exception) as exc:
            _run(pickups_routes.create_pickup(
                _payload(seeded["job_id"], ["stone-1", "stone-2"], "memo_return"),
                user=seeded["admin"],
            ))
        assert "already" in str(exc.value).lower()

    def test_cancelled_stone_blocked(self, seeded):
        with pytest.raises(Exception) as exc:
            _run(pickups_routes.create_pickup(
                _payload(seeded["job_id"], ["stone-4"], "memo_return"),
                user=seeded["admin"],
            ))
        assert "cancelled" in str(exc.value).lower() or "not in this job" in str(exc.value).lower()

    def test_invalid_type_rejected(self, seeded):
        with pytest.raises(Exception):
            _run(pickups_routes.create_pickup(
                pickups_routes.CreatePickupPayload(
                    job_id=seeded["job_id"], type="bogus", stone_ids=["stone-1"],
                ),
                user=seeded["admin"],
            ))

    def test_memo_return_then_cert_collection_independent(self, seeded):
        """memo_return and cert_collection of the SAME stones are allowed
        — they're separate flows (the cert can travel home even after the
        stone went back to the client)."""
        _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-2"], "memo_return"),
            user=seeded["admin"],
        ))
        # Cert collection of the same stone — fine.
        res = _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-2"], "cert_collection"),
            user=seeded["admin"],
        ))
        assert res["type"] == "cert_collection"


class TestListAndDelete:
    def test_list_returns_in_reverse_chronological_order(self, seeded):
        _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-1"], "memo_return"),
            user=seeded["admin"],
        ))
        _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-2"], "cert_collection"),
            user=seeded["admin"],
        ))
        rows = _run(pickups_routes.list_job_pickups(seeded["job_id"], user=seeded["admin"]))
        assert len(rows) == 2
        # Newest first.
        assert rows[0]["type"] == "cert_collection"
        assert rows[1]["type"] == "memo_return"

    def test_delete_reverts_stone_status(self, seeded):
        ev = _run(pickups_routes.create_pickup(
            _payload(seeded["job_id"], ["stone-1"], "memo_return"),
            user=seeded["admin"],
        ))
        # Status is 'returned' now.
        job = _run(db.jobs.find_one({"_id": pickups_routes._oid(seeded["job_id"])}))
        assert next(s for s in job["stones"] if s["id"] == "stone-1")["stone_status"] == "returned"

        _run(pickups_routes.delete_pickup(ev["id"], user=seeded["admin"]))
        # Reverted.
        job = _run(db.jobs.find_one({"_id": pickups_routes._oid(seeded["job_id"])}))
        assert next(s for s in job["stones"] if s["id"] == "stone-1")["stone_status"] == "at_office"
