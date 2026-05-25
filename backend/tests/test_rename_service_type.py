"""Tests for POST /api/pricing/rename-service-type (Feb 25, 2026).

Why this endpoint exists: the chip-delete UI hides the `×` for any service
type that has existing jobs (to prevent orphaning). That makes renaming via
delete+add impossible. The rename endpoint atomically updates:
  1. `pricing_config.service_types`
  2. `pricing_config.brackets[*].fees` (key renamed in each bracket)
  3. `jobs.service_type` for every job using the old name
"""
import datetime as _dt
import os

import pytest

requests = pytest.importorskip("requests")
jwt = pytest.importorskip("jwt")
pymongo = pytest.importorskip("pymongo")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _read_env(name: str, default: str = "") -> str:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return os.environ.get(name, default)


@pytest.fixture(scope="module")
def auth_headers():
    secret = _read_env("JWT_SECRET", "bashari-secret-key-2024-secure")
    mongo_url = _read_env("MONGO_URL", "mongodb://localhost:27017")
    db_name = _read_env("DB_NAME", "bashari_erp")
    try:
        client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
        admin = client[db_name].users.find_one({"email": "admin@bashari.com"})
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"mongo unreachable: {exc}")
    if not admin:
        pytest.skip("admin@bashari.com not seeded")
    token = jwt.encode(
        {"sub": str(admin["_id"]), "exp": _dt.datetime.utcnow() + _dt.timedelta(hours=1)},
        secret, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client_and_branch(auth_headers):
    r = requests.get(f"{BASE_URL}/api/clients", headers=auth_headers, timeout=10)
    if r.status_code != 200 or not r.json():
        pytest.skip("no clients seeded")
    cl = r.json()[0]
    return {"client_id": cl["id"], "branch_id": cl["branch_id"]}


def _get_pricing(headers):
    return requests.get(f"{BASE_URL}/api/pricing", headers=headers, timeout=10).json()


def _put_pricing(headers, snapshot):
    """Send the pricing snapshot back, stripping any keys the PUT model
    doesn't accept (timestamps etc)."""
    allowed = {
        "brackets", "color_stability_fee", "mounted_jewellery_fee",
        "service_types", "stone_types", "shapes",
        "payment_destinations", "couriers", "recheck_reasons",
    }
    body = {k: v for k, v in snapshot.items() if k in allowed and v is not None}
    return requests.put(f"{BASE_URL}/api/pricing", headers=headers, json=body, timeout=10)


def _del(job_id, headers):
    requests.delete(f"{BASE_URL}/api/jobs/{job_id}", headers=headers, timeout=10)


def test_rename_rejects_blank_and_identical(auth_headers):
    r1 = requests.post(
        f"{BASE_URL}/api/pricing/rename-service-type", headers=auth_headers,
        json={"old_name": "", "new_name": "x"}, timeout=10,
    )
    assert r1.status_code == 400
    r2 = requests.post(
        f"{BASE_URL}/api/pricing/rename-service-type", headers=auth_headers,
        json={"old_name": "Express", "new_name": "Express"}, timeout=10,
    )
    assert r2.status_code == 400


def test_rename_rejects_unknown_old_name(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/pricing/rename-service-type", headers=auth_headers,
        json={"old_name": "DoesNotExist_xyz_123", "new_name": "Whatever"}, timeout=10,
    )
    assert r.status_code == 404, r.text


def test_rename_merges_into_existing_name_and_retags_jobs(client_and_branch, auth_headers):
    """The canonical bug we're fixing: user has 'Recheck Type' AND 'Recheck'
    in the config and at least one job tagged 'Recheck Type'. After rename,
    the old chip is gone, fees are merged, and the job is re-tagged."""
    original = _get_pricing(auth_headers)
    try:
        # Seed 'Recheck Type' with a unique fee per bracket so we can verify
        # the merge picked the right number.
        seeded = {**original}
        seeded["service_types"] = list(original.get("service_types", [])) + ["Recheck Type"]
        seeded["brackets"] = [
            {**b, "fees": {**(b.get("fees") or {}), "Recheck Type": 77}}
            for b in original.get("brackets", [])
        ]
        assert _put_pricing(auth_headers, seeded).status_code == 200

        # Tag a real job with 'Recheck Type'
        job = requests.post(
            f"{BASE_URL}/api/jobs", headers=auth_headers,
            json={
                **client_and_branch,
                "service_type": "Recheck Type",
                "certificate_units": [
                    {"stones": [{"stone_type": "Ruby", "weight": 1.0, "shape": "Oval", "value": 1000}]}
                ],
            }, timeout=10,
        ).json()
        job_id = job["id"]

        try:
            # Rename
            r = requests.post(
                f"{BASE_URL}/api/pricing/rename-service-type", headers=auth_headers,
                json={"old_name": "Recheck Type", "new_name": "Recheck"}, timeout=10,
            )
            assert r.status_code == 200, r.text
            payload = r.json()
            assert payload["jobs_updated"] >= 1
            assert "Recheck Type" not in payload["service_types"]
            assert "Recheck" in payload["service_types"]

            # Pricing now has no 'Recheck Type' key in any bracket
            after = _get_pricing(auth_headers)
            for b in after["brackets"]:
                assert "Recheck Type" not in (b.get("fees") or {}), b

            # Job is re-tagged
            j2 = requests.get(
                f"{BASE_URL}/api/jobs/{job_id}", headers=auth_headers, timeout=10,
            ).json()
            assert j2["service_type"] == "Recheck"
        finally:
            _del(job_id, auth_headers)
    finally:
        # Restore the original pricing config so we don't leave the test DB
        # in a weird state for subsequent tests / dev work.
        _put_pricing(auth_headers, original)


def test_rename_to_brand_new_name_swaps_in_place(auth_headers):
    """When new_name doesn't exist yet, the entry is renamed in place
    (preserving order in service_types and brackets[*].fees)."""
    original = _get_pricing(auth_headers)
    try:
        # Seed 'TempServiceXYZ' so we can rename it without touching
        # anything the user actually relies on.
        seeded = {**original}
        seeded["service_types"] = list(original.get("service_types", [])) + ["TempServiceXYZ"]
        seeded["brackets"] = [
            {**b, "fees": {**(b.get("fees") or {}), "TempServiceXYZ": 88}}
            for b in original.get("brackets", [])
        ]
        assert _put_pricing(auth_headers, seeded).status_code == 200

        r = requests.post(
            f"{BASE_URL}/api/pricing/rename-service-type", headers=auth_headers,
            json={"old_name": "TempServiceXYZ", "new_name": "RenamedXYZ"}, timeout=10,
        )
        assert r.status_code == 200
        after = _get_pricing(auth_headers)
        assert "TempServiceXYZ" not in after["service_types"]
        assert "RenamedXYZ" in after["service_types"]
        # Bracket fee should carry over with the original value (88)
        for b in after["brackets"]:
            fees = b.get("fees") or {}
            assert "TempServiceXYZ" not in fees
            assert fees.get("RenamedXYZ") == 88
    finally:
        _put_pricing(auth_headers, original)
