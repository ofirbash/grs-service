"""HTTP-level tests for the Recheck-reasons feature (Feb 25, 2026).

Rules under test:
- POST /api/jobs with service_type=='Recheck' and no recheck_reasons → 400
- POST /api/jobs with service_type=='Recheck' and recheck_reasons=['Origin']
  → 200, persisted and returned by GET /api/jobs/{id}
- POST /api/jobs with service_type=='Express' and stale recheck_reasons in
  the body → 200; the field is silently dropped from the stored doc
- GET /api/pricing returns a `recheck_reasons` list (defaults to 4 entries)
- PUT /api/pricing accepts and persists a custom recheck_reasons list
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
    assert r.status_code == 200, r.text
    clients = r.json()
    if not clients:
        pytest.skip("no clients seeded — cannot build a Recheck job for testing")
    cl = clients[0]
    return {"client_id": cl["id"], "branch_id": cl["branch_id"]}


def _delete(job_id: str, headers):
    requests.delete(f"{BASE_URL}/api/jobs/{job_id}", headers=headers, timeout=10)


def _payload(ids, *, service_type, recheck_reasons=None, extras=None):
    body = {
        **ids,
        "service_type": service_type,
        "notes": None,
        "certificate_units": [
            {"stones": [{"stone_type": "Ruby", "weight": 1.0, "shape": "Oval", "value": 1000}]}
        ],
    }
    if recheck_reasons is not None:
        body["recheck_reasons"] = recheck_reasons
    if extras:
        body.update(extras)
    return body


def test_recheck_without_reasons_rejected(client_and_branch, auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers,
        json=_payload(client_and_branch, service_type="Recheck"), timeout=10,
    )
    assert r.status_code == 400, r.text
    assert "reason" in (r.json().get("detail", "").lower())


def test_recheck_with_empty_strings_rejected(client_and_branch, auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers,
        json=_payload(client_and_branch, service_type="Recheck", recheck_reasons=["", "  "]),
        timeout=10,
    )
    assert r.status_code == 400, r.text


def test_recheck_with_reasons_round_trips(client_and_branch, auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers,
        json=_payload(client_and_branch, service_type="Recheck", recheck_reasons=["Origin", "Color"]),
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        assert job["recheck_reasons"] == ["Origin", "Color"]
        # GET round-trip
        g = requests.get(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=10)
        assert g.status_code == 200
        assert g.json()["recheck_reasons"] == ["Origin", "Color"]
    finally:
        _delete(job["id"], auth_headers)


def test_recheck_dedupes_reasons(client_and_branch, auth_headers):
    """Duplicates in the input should be silently deduped (preserving order)."""
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers,
        json=_payload(client_and_branch, service_type="Recheck",
                      recheck_reasons=["Origin", "Color", "Origin", " Color "]),
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        assert job["recheck_reasons"] == ["Origin", "Color"], job["recheck_reasons"]
    finally:
        _delete(job["id"], auth_headers)


def test_non_recheck_drops_stale_reasons(client_and_branch, auth_headers):
    """Frontend may send a stale recheck_reasons list when the user switched
    to a non-Recheck service. Backend should silently drop it rather than
    persist a misleading field."""
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers,
        json=_payload(client_and_branch, service_type="Express", recheck_reasons=["Origin"]),
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        assert job.get("recheck_reasons") in (None, [])
    finally:
        _delete(job["id"], auth_headers)


def test_pricing_endpoint_exposes_recheck_reasons(auth_headers):
    r = requests.get(f"{BASE_URL}/api/pricing", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "recheck_reasons" in body
    assert isinstance(body["recheck_reasons"], list)
    assert len(body["recheck_reasons"]) >= 1


def test_pricing_update_persists_recheck_reasons(auth_headers):
    """Admin-edit flow: GET current → PUT a new list → GET again to verify."""
    g0 = requests.get(f"{BASE_URL}/api/pricing", headers=auth_headers, timeout=10)
    current = g0.json()
    original = list(current.get("recheck_reasons") or [])
    try:
        custom = ["Origin", "Color", "Identification", "Comment", "Other"]
        # PUT requires all the fields the GET returns — send back the whole
        # payload with just recheck_reasons swapped in.
        put_body = {**current, "recheck_reasons": custom}
        # PricingUpdateRequest doesn't accept unknown keys, so strip them
        for k in list(put_body.keys()):
            if k not in (
                "brackets", "color_stability_fee", "mounted_jewellery_fee",
                "service_types", "stone_types", "shapes",
                "payment_destinations", "couriers", "recheck_reasons",
            ):
                put_body.pop(k)
        r = requests.put(f"{BASE_URL}/api/pricing", headers=auth_headers, json=put_body, timeout=10)
        assert r.status_code == 200, r.text
        g1 = requests.get(f"{BASE_URL}/api/pricing", headers=auth_headers, timeout=10)
        assert g1.json()["recheck_reasons"] == custom
    finally:
        # Restore original list so we don't leave the test DB in a weird state
        if original:
            restore = {**current, "recheck_reasons": original}
            for k in list(restore.keys()):
                if k not in (
                    "brackets", "color_stability_fee", "mounted_jewellery_fee",
                    "service_types", "stone_types", "shapes",
                    "payment_destinations", "couriers", "recheck_reasons",
                ):
                    restore.pop(k)
            requests.put(f"{BASE_URL}/api/pricing", headers=auth_headers, json=restore, timeout=10)
