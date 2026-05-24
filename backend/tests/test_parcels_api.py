"""HTTP-level API tests for the parcel feature (iteration 28).

JobCreate schema uses:
  client_id, branch_id, service_type, certificate_units:[{stones:[StoneCreate]}]
Each certificate_unit = 1 logical certificate. A parcel is a single StoneCreate
inside one certificate_unit with is_parcel=true and stone_count>=2.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _get_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "admin@bashari.com",
            "password": "admin123",
            "website": "",
            "turnstile_token": "x",
        },
        timeout=10,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    if body.get("requires_2fa"):
        pytest.skip("admin requires 2FA")
    token = body.get("token") or body.get("access_token")
    assert token, body
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
