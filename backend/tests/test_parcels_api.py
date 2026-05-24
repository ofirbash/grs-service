"""HTTP-level API tests for the parcel feature (iteration 28).

JobCreate schema uses:
  client_id, branch_id, service_type, certificate_units:[{stones:[StoneCreate]}]
Each certificate_unit = 1 logical certificate. A parcel is a single StoneCreate
inside one certificate_unit with is_parcel=true and stone_count>=2.

These tests mint a JWT directly using the JWT_SECRET from backend/.env so they
don't depend on Turnstile being blanked. Skipped if requests or pymongo is not
available, or if MongoDB is unreachable.
"""
import datetime as _dt
import os

import pytest

requests = pytest.importorskip("requests")
jwt = pytest.importorskip("jwt")
pymongo = pytest.importorskip("pymongo")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _read_env_var(name: str, default: str = "") -> str:
    """Read a value out of /app/backend/.env without requiring python-dotenv."""
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith(f"{name}="):
                    val = line.split("=", 1)[1].strip()
                    return val.strip('"').strip("'")
    except FileNotFoundError:
        pass
    return os.environ.get(name, default)


def _get_token() -> str:
    """Mint an admin JWT directly — bypasses Turnstile so these tests run in
    any env where MongoDB is reachable, not just one with the bot check off."""
    secret = _read_env_var("JWT_SECRET", "bashari-secret-key-2024-secure")
    mongo_url = _read_env_var("MONGO_URL", "mongodb://localhost:27017")
    db_name = _read_env_var("DB_NAME", "bashari_erp")
    try:
        client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
        admin = client[db_name].users.find_one({"email": "admin@bashari.com"})
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"mongo unreachable: {exc}")
    if not admin:
        pytest.skip("admin@bashari.com not seeded")
    token = jwt.encode(
        {
            "sub": str(admin["_id"]),
            "exp": _dt.datetime.utcnow() + _dt.timedelta(hours=1),
        },
        secret,
        algorithm="HS256",
    )
    return token


@pytest.fixture(scope="module")
def auth_headers():
    return {
        "Authorization": f"Bearer {_get_token()}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def ids(auth_headers):
    """Pull client_id + branch_id from an existing job."""
    r = requests.get(
        f"{BASE_URL}/api/jobs?limit=1", headers=auth_headers, timeout=10
    )
    assert r.status_code == 200, r.text
    items = r.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("jobs") or []
    if not items:
        pytest.skip("no seed job available to copy client/branch ids")
    j = items[0]
    return {"client_id": j["client_id"], "branch_id": j["branch_id"]}


SINGLE = {"stone_type": "Ruby", "weight": 2.0, "shape": "Round", "value": 5000}


def _make_payload(ids, units):
    return {
        "client_id": ids["client_id"],
        "branch_id": ids["branch_id"],
        "service_type": "Express",
        "certificate_units": units,
    }


def _del(job_id, auth_headers):
    try:
        requests.delete(
            f"{BASE_URL}/api/jobs/{job_id}", headers=auth_headers, timeout=10
        )
    except Exception:
        pass


def test_create_job_with_single_and_parcel(ids, auth_headers):
    parcel = {
        "stone_type": "Sapphire",
        "weight": 7.5,
        "shape": "Oval",
        "value": 15000,
        "is_parcel": True,
        "stone_count": 3,
    }
    payload = _make_payload(
        ids,
        [{"stones": [SINGLE]}, {"stones": [parcel]}],
    )
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        assert job["total_stones"] == 4, f"expected 4, got {job.get('total_stones')}"
        assert job["total_certificates"] == 2, (
            f"expected 2 certs, got {job.get('total_certificates')}"
        )
        kinds = [s.get("kind") for s in job["stones"]]
        assert "parcel" in kinds
        parcels = [s for s in job["stones"] if s.get("kind") == "parcel"]
        assert len(parcels) == 1
        assert parcels[0].get("stone_count") == 3
    finally:
        _del(job["id"], auth_headers)


def test_create_job_parcel_with_count_lt_2_rejected(ids, auth_headers):
    bad = {
        "stone_type": "Sapphire",
        "weight": 5,
        "shape": "Oval",
        "value": 8000,
        "is_parcel": True,
        "stone_count": 1,
    }
    payload = _make_payload(ids, [{"stones": [bad]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=10
    )
    assert r.status_code == 400, f"got {r.status_code}: {r.text}"
    assert "stone_count" in r.text.lower()


def test_group_stones_rejects_parcel(ids, auth_headers):
    parcel = {
        "stone_type": "Sapphire",
        "weight": 7.5,
        "shape": "Oval",
        "value": 15000,
        "is_parcel": True,
        "stone_count": 3,
    }
    payload = _make_payload(ids, [{"stones": [SINGLE]}, {"stones": [parcel]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        stone_ids = [s["id"] for s in job["stones"]]
        g = requests.put(
            f"{BASE_URL}/api/jobs/{job['id']}/group-stones",
            headers=auth_headers,
            json={"stone_ids": stone_ids, "group_number": 1},
            timeout=10,
        )
        assert g.status_code == 400, f"got {g.status_code}: {g.text}"
        assert "Parcels cannot be added to a certificate group" in g.text
    finally:
        _del(job["id"], auth_headers)


def test_cs_fee_on_parcel_multiplies_by_n(ids, auth_headers):
    parcel = {
        "stone_type": "Sapphire",
        "weight": 7.5,
        "shape": "Oval",
        "value": 15000,
        "is_parcel": True,
        "stone_count": 3,
    }
    payload = _make_payload(ids, [{"stones": [parcel]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        p = job["stones"][0]
        start = float(p.get("fee") or 0)
        t1 = requests.put(
            f"{BASE_URL}/api/stones/{p['id']}/fees",
            headers=auth_headers,
            json={"color_stability_test": True},
            timeout=10,
        )
        assert t1.status_code == 200, t1.text
        after_on = float(t1.json().get("total_fee") or t1.json()["stone"]["fee"])
        delta = round(after_on - start, 2)
        assert delta > 0, f"start={start} after_on={after_on}"
        assert abs(delta % 3) < 0.01, (
            f"CS delta {delta} not divisible by 3 (parcel CS should be cs_fee*N)"
        )

        t2 = requests.put(
            f"{BASE_URL}/api/stones/{p['id']}/fees",
            headers=auth_headers,
            json={"color_stability_test": False},
            timeout=10,
        )
        assert t2.status_code == 200, t2.text
        after_off = float(t2.json().get("total_fee") or t2.json()["stone"]["fee"])
        assert abs(after_off - start) < 0.01, f"after_off={after_off} start={start}"
    finally:
        _del(job["id"], auth_headers)


def test_mounted_fee_on_parcel_charged_once(ids, auth_headers):
    parcel = {
        "stone_type": "Sapphire",
        "weight": 7.5,
        "shape": "Oval",
        "value": 15000,
        "is_parcel": True,
        "stone_count": 4,
    }
    payload = _make_payload(ids, [{"stones": [parcel]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        p = job["stones"][0]
        start = float(p.get("fee") or 0)
        t1 = requests.put(
            f"{BASE_URL}/api/stones/{p['id']}/fees",
            headers=auth_headers,
            json={"mounted": True},
            timeout=10,
        )
        assert t1.status_code == 200, t1.text
        after = float(t1.json().get("total_fee") or t1.json()["stone"]["fee"])
        delta = round(after - start, 2)
        assert delta > 0, f"start={start} after={after}"
        # mounted_fee is small flat charge (~$50); delta must NOT be ×4
        assert delta < 200, f"mounted delta {delta} looks multiplied by N"
    finally:
        _del(job["id"], auth_headers)


def test_add_stone_endpoint_supports_parcel(ids, auth_headers):
    payload = _make_payload(ids, [{"stones": [SINGLE]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        a = requests.post(
            f"{BASE_URL}/api/jobs/{job['id']}/stones",
            headers=auth_headers,
            json={
                "stone_type": "Sapphire",
                "weight": 10.0,
                "shape": "Oval",
                "value": 40000,
                "is_parcel": True,
                "stone_count": 4,
            },
            timeout=10,
        )
        assert a.status_code in (200, 201), a.text
        g = requests.get(
            f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=10
        )
        assert g.status_code == 200
        upd = g.json()
        assert upd["total_stones"] == 5, (
            f"expected 5 physical, got {upd['total_stones']}"
        )
        assert upd["total_certificates"] == 2
        parcels = [s for s in upd["stones"] if s.get("kind") == "parcel"]
        assert len(parcels) == 1
        assert parcels[0]["stone_count"] == 4
    finally:
        _del(job["id"], auth_headers)


def test_get_job_returns_total_certificates(ids, auth_headers):
    payload = _make_payload(ids, [{"stones": [SINGLE]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        g = requests.get(
            f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=10
        )
        assert g.status_code == 200
        body = g.json()
        assert "total_certificates" in body
        assert body["total_certificates"] == 1
    finally:
        _del(job["id"], auth_headers)


def test_parcel_verbal_findings_persist_per_stone_array(ids, auth_headers):
    """Phase 3 contract: saving a parcel's verbal findings with a `per_stone`
    array round-trips through `update_stone_verbal` and is present on the
    next GET of the job. The shared certificate_id sits at the top, and each
    physical stone has its own {weight, identification, color, origin,
    comment} entry."""
    parcel = {
        "stone_type": "Ruby",
        "weight": 5.0,
        "shape": "Oval",
        "value": 9000,
        "is_parcel": True,
        "stone_count": 3,
    }
    payload = _make_payload(ids, [{"stones": [parcel]}])
    r = requests.post(
        f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        parcel_stone = next(s for s in job["stones"] if s.get("kind") == "parcel")
        sid = parcel_stone["id"]
        body = {
            "structured_findings": {
                "certificate_id": "BL-PARCEL-001",
                "per_stone": [
                    {"weight": 1.6, "identification": "Natural Ruby", "color": "Red", "origin": "Burma", "comment": ""},
                    {"weight": 1.7, "identification": "Natural Ruby", "color": "Red", "origin": "Burma", "comment": "Slightly included"},
                    {"weight": 1.7, "identification": "Natural Ruby", "color": "Red", "origin": "Burma", "comment": ""},
                ],
            }
        }
        r2 = requests.put(
            f"{BASE_URL}/api/stones/{sid}/verbal",
            headers=auth_headers, json=body, timeout=10,
        )
        assert r2.status_code == 200, r2.text

        g = requests.get(
            f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=10
        )
        assert g.status_code == 200
        refreshed = g.json()
        ps = next(s for s in refreshed["stones"] if s["id"] == sid)
        vf = ps["verbal_findings"]
        assert isinstance(vf, dict), f"expected dict, got {type(vf)}: {vf}"
        assert vf.get("certificate_id") == "BL-PARCEL-001"
        per_stone = vf.get("per_stone") or []
        assert len(per_stone) == 3, f"expected 3 per_stone entries, got {len(per_stone)}"
        assert per_stone[1]["comment"] == "Slightly included"
        assert per_stone[0]["origin"] == "Burma"
        # Weights should round-trip as floats
        weights = [entry.get("weight") for entry in per_stone]
        assert weights == [1.6, 1.7, 1.7], weights
    finally:
        _del(job["id"], auth_headers)
