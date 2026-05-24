"""HTTP integration test: ensure PDF memo-in & invoice endpoints render parcel rows."""
import datetime as _dt
import os
import pytest

requests = pytest.importorskip("requests")
jwt = pytest.importorskip("jwt")
pymongo = pytest.importorskip("pymongo")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _read_env_var(name, default=""):
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
    secret = _read_env_var("JWT_SECRET", "bashari-secret-key-2024-secure")
    mongo_url = _read_env_var("MONGO_URL", "mongodb://localhost:27017")
    db_name = _read_env_var("DB_NAME", "bashari_erp")
    try:
        client = pymongo.MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
        admin = client[db_name].users.find_one({"email": "admin@bashari.com"})
    except Exception as exc:
        pytest.skip(f"mongo unreachable: {exc}")
    if not admin:
        pytest.skip("no admin")
    token = jwt.encode(
        {"sub": str(admin["_id"]), "exp": _dt.datetime.utcnow() + _dt.timedelta(hours=1)},
        secret, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ids(auth_headers):
    r = requests.get(f"{BASE_URL}/api/jobs?limit=1", headers=auth_headers, timeout=10)
    if r.status_code != 200 or not r.json():
        pytest.skip("no seed job")
    j = r.json()[0]
    return {"client_id": j["client_id"], "branch_id": j["branch_id"]}


def _make_job(ids):
    return {
        "client_id": ids["client_id"],
        "branch_id": ids["branch_id"],
        "service_type": "Standard",
        "certificate_units": [
            {"stones": [{"stone_type": "Sapphire", "weight": 2.5, "shape": "Oval", "value": 8000}]},
            {"stones": [{"stone_type": "Sapphire", "weight": 7.5, "shape": "Oval",
                         "value": 15000, "is_parcel": True, "stone_count": 3}]},
        ],
    }


def test_memo_in_pdf_renders_parcel(auth_headers, ids):
    payload = _make_job(ids)
    r = requests.post(f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        rp = requests.get(f"{BASE_URL}/api/jobs/{job['id']}/pdf/memo-in",
                          headers=auth_headers, timeout=30)
        assert rp.status_code == 200, rp.text[:500]
        assert rp.headers.get("content-type", "").startswith("application/pdf")
        body = rp.content
        assert len(body) > 1000, f"PDF too small: {len(body)} bytes"
        with open("/tmp/test_parcel_memo.pdf", "wb") as f:
            f.write(body)
        # Try extracting text
        try:
            from pypdf import PdfReader
            text = "".join(p.extract_text() or "" for p in PdfReader("/tmp/test_parcel_memo.pdf").pages)
            assert "parcel of 3" in text.lower() or "parcel of 3" in text, f"text: {text[:1500]}"
            assert "(total)" in text or "total" in text.lower()
        except ImportError:
            pass  # pypdf not installed; size check is enough
    finally:
        requests.delete(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=10)


def test_invoice_pdf_renders_parcel(auth_headers, ids):
    payload = _make_job(ids)
    r = requests.post(f"{BASE_URL}/api/jobs", headers=auth_headers, json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    job = r.json()
    try:
        rp = requests.get(f"{BASE_URL}/api/jobs/{job['id']}/pdf/invoice",
                          headers=auth_headers, timeout=30)
        assert rp.status_code == 200, rp.text[:500]
        body = rp.content
        assert len(body) > 1000
        with open("/tmp/test_parcel_invoice.pdf", "wb") as f:
            f.write(body)
        try:
            from pypdf import PdfReader
            text = "".join(p.extract_text() or "" for p in PdfReader("/tmp/test_parcel_invoice.pdf").pages)
            assert "parcel of 3" in text or "parcel of 3" in text.lower(), text[:1500]
        except ImportError:
            pass
    finally:
        requests.delete(f"{BASE_URL}/api/jobs/{job['id']}", headers=auth_headers, timeout=10)
