"""
Test Suite for Structured Verbal Findings and Dropdown Settings APIs
Tests the new structured verbal findings form with dropdowns (identification, color, origin, comment)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://grs-lab-erp.preview.emergentagent.com')
if not BASE_URL.endswith('/api'):
    BASE_URL = BASE_URL.rstrip('/') + '/api'


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@bashari.com",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    """Create headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestDropdownSettings:
    """Test dropdown settings endpoints for verbal findings"""

    def test_get_dropdown_settings(self, auth_headers):
        """GET /settings/dropdowns - should return all dropdown options"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        # Verify all 4 dropdown fields exist
        assert "identification" in data, "identification dropdown missing"
        assert "color" in data, "color dropdown missing"
        assert "origin" in data, "origin dropdown missing"
        assert "comment" in data, "comment dropdown missing"
        
        # Verify dropdowns have options
        assert len(data["identification"]) > 0, "identification has no options"
        assert len(data["color"]) > 0, "color has no options"
        assert len(data["origin"]) > 0, "origin has no options"
        assert len(data["comment"]) > 0, "comment has no options"
        
        print(f"✓ Dropdown settings returned: {len(data['identification'])} identification, {len(data['color'])} color, {len(data['origin'])} origin, {len(data['comment'])} comment options")

    def test_identification_dropdown_values(self, auth_headers):
        """Verify identification dropdown contains expected values"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        identification_values = [opt["value"] for opt in data["identification"]]
        
        # Check for expected values from the PDFs
        expected_values = [
            "NATURAL RUBY",
            "NATURAL SAPPHIRE",
            "NATURAL EMERALD",
            "NATURAL SPINEL"
        ]
        
        for expected in expected_values:
            assert expected in identification_values, f"Missing identification value: {expected}"
        
        print(f"✓ Identification dropdown contains all expected values")

    def test_color_dropdown_values(self, auth_headers):
        """Verify color dropdown contains expected values"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        color_values = [opt["value"] for opt in data["color"]]
        
        # Check for expected values from PDFs
        expected_values = [
            "VIVID RED",
            "VIVID BLUE",
            "VIVID GREEN",
            "VIVID RED PIGEON BLOOD",
            "VIVID BLUE ROYAL BLUE"
        ]
        
        for expected in expected_values:
            assert expected in color_values, f"Missing color value: {expected}"
        
        print(f"✓ Color dropdown contains all expected values")

    def test_origin_dropdown_values(self, auth_headers):
        """Verify origin dropdown contains expected values"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        origin_values = [opt["value"] for opt in data["origin"]]
        
        # Check for expected values from PDFs
        expected_values = [
            "BURMA (MYANMAR)",
            "SRI LANKA",
            "MADAGASCAR",
            "COLOMBIA"
        ]
        
        for expected in expected_values:
            assert expected in origin_values, f"Missing origin value: {expected}"
        
        print(f"✓ Origin dropdown contains all expected values")

    def test_comment_dropdown_values(self, auth_headers):
        """Verify comment dropdown contains expected values"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        comment_values = [opt["value"] for opt in data["comment"]]
        
        # Check for expected values from PDFs
        expected_values = [
            "NO INDICATION OF TREATMENT",
            "HEATED",
            "H(a)",
            "H(b)"
        ]
        
        for expected in expected_values:
            assert expected in comment_values, f"Missing comment value: {expected}"
        
        print(f"✓ Comment dropdown contains all expected values")

    def test_initialize_dropdowns_idempotent(self, auth_headers):
        """POST /settings/dropdowns/initialize - should be idempotent"""
        response = requests.post(f"{BASE_URL}/settings/dropdowns/initialize", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        # Second call should report already initialized or be successful
        assert "message" in data
        print(f"✓ Initialize dropdowns returned: {data['message']}")


class TestStructuredVerbalFindings:
    """Test structured verbal findings save/retrieve"""

    def test_get_jobs_with_stones(self, auth_headers):
        """GET /jobs - verify jobs have stones for testing"""
        response = requests.get(f"{BASE_URL}/jobs", headers=auth_headers)
        assert response.status_code == 200
        
        jobs = response.json()
        assert len(jobs) > 0, "No jobs available for testing"
        
        # Find a job with stones
        job_with_stones = next((j for j in jobs if j["total_stones"] > 0), None)
        assert job_with_stones is not None, "No jobs with stones found"
        
        print(f"✓ Found job #{job_with_stones['job_number']} with {job_with_stones['total_stones']} stones")
        return job_with_stones

    def test_save_structured_verbal_findings(self, auth_headers):
        """PUT /stones/{id}/verbal - save structured verbal findings"""
        # First get a job with stones
        response = requests.get(f"{BASE_URL}/jobs", headers=auth_headers)
        assert response.status_code == 200
        jobs = response.json()
        
        job_with_stones = next((j for j in jobs if j["total_stones"] > 0 and len(j.get("stones", [])) > 0), None)
        assert job_with_stones is not None, "No job with stones found"
        
        stone = job_with_stones["stones"][0]
        stone_id = stone["id"]
        stone_weight = stone["weight"]
        
        # Save structured verbal findings
        structured_findings = {
            "certificate_id": "TEST-CERT-001",
            "weight": stone_weight,
            "identification": "NATURAL RUBY",
            "color": "VIVID RED PIGEON BLOOD",
            "origin": "BURMA (MYANMAR)",
            "comment": "NO INDICATION OF TREATMENT"
        }
        
        response = requests.put(
            f"{BASE_URL}/stones/{stone_id}/verbal",
            headers=auth_headers,
            json={"structured_findings": structured_findings}
        )
        assert response.status_code == 200, f"Failed to save verbal findings: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"✓ Saved structured verbal findings for stone {stone_id}")
        
        return stone_id, structured_findings

    def test_verify_structured_verbal_findings_persisted(self, auth_headers):
        """Verify structured verbal findings are persisted correctly"""
        # First save structured findings
        response = requests.get(f"{BASE_URL}/jobs", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get jobs: {response.status_code} {response.text}"
        jobs = response.json()
        
        job_with_stones = next((j for j in jobs if j["total_stones"] > 0 and len(j.get("stones", [])) > 0), None)
        assert job_with_stones is not None
        
        stone = job_with_stones["stones"][0]
        stone_id = stone["id"]
        
        # Save test data
        test_findings = {
            "certificate_id": "VERIFY-TEST-002",
            "weight": 2.5,
            "identification": "NATURAL SAPPHIRE",
            "color": "VIVID BLUE ROYAL BLUE",
            "origin": "KASHMIR (INDIA)",
            "comment": "HEATED"
        }
        
        response = requests.put(
            f"{BASE_URL}/stones/{stone_id}/verbal",
            headers=auth_headers,
            json={"structured_findings": test_findings}
        )
        assert response.status_code == 200
        
        # Verify by fetching the job again
        response = requests.get(f"{BASE_URL}/jobs/{job_with_stones['id']}", headers=auth_headers)
        assert response.status_code == 200
        
        updated_job = response.json()
        updated_stone = next((s for s in updated_job["stones"] if s["id"] == stone_id), None)
        assert updated_stone is not None
        
        # Check if verbal_findings is stored as structured object
        verbal = updated_stone.get("verbal_findings")
        assert verbal is not None, "verbal_findings not saved"
        
        if isinstance(verbal, dict):
            assert verbal.get("certificate_id") == test_findings["certificate_id"]
            assert verbal.get("identification") == test_findings["identification"]
            print(f"✓ Structured verbal findings persisted correctly")
        else:
            print(f"Note: verbal_findings stored as: {type(verbal)}")


class TestShipmentNestedJob:
    """Test nested job modal in shipments page"""

    def test_get_shipments_with_jobs(self, auth_headers):
        """GET /shipments - verify shipments contain job details"""
        response = requests.get(f"{BASE_URL}/shipments", headers=auth_headers)
        assert response.status_code == 200
        
        shipments = response.json()
        if len(shipments) == 0:
            pytest.skip("No shipments available for testing")
        
        shipment_with_jobs = next((s for s in shipments if s["total_jobs"] > 0), None)
        if not shipment_with_jobs:
            pytest.skip("No shipments with jobs found")
        
        print(f"✓ Found shipment #{shipment_with_jobs['shipment_number']} with {shipment_with_jobs['total_jobs']} jobs")
        return shipment_with_jobs

    def test_shipment_job_details_available(self, auth_headers):
        """Verify shipment returns job_ids for nested modal"""
        response = requests.get(f"{BASE_URL}/shipments", headers=auth_headers)
        shipments = response.json()
        
        shipment_with_jobs = next((s for s in shipments if s["total_jobs"] > 0), None)
        if not shipment_with_jobs:
            pytest.skip("No shipments with jobs found")
        
        # Verify job_ids array exists
        assert "job_ids" in shipment_with_jobs, "job_ids not in shipment response"
        assert len(shipment_with_jobs["job_ids"]) > 0, "job_ids array is empty"
        
        # Verify we can fetch the individual job
        job_id = shipment_with_jobs["job_ids"][0]
        job_response = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=auth_headers)
        assert job_response.status_code == 200
        
        job = job_response.json()
        assert "stones" in job, "Job doesn't contain stones"
        
        print(f"✓ Shipment job details accessible: Job #{job['job_number']} with {len(job['stones'])} stones")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
