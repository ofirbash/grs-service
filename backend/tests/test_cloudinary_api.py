"""
Cloudinary Integration API Tests
Tests the Cloudinary signature and upload endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bashari-lab-direct.preview.emergentagent.com/api')

# Test credentials
TEST_EMAIL = "admin@bashari.com"
TEST_PASSWORD = "admin123"


class TestCloudinarySignature:
    """Test Cloudinary signature endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Could not authenticate")

    def test_signature_with_uploads_folder(self):
        """Test signature generation with 'uploads' folder"""
        response = requests.get(
            f"{BASE_URL}/cloudinary/signature",
            params={"folder": "uploads", "resource_type": "image"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "signature" in data, "Missing signature"
        assert "timestamp" in data, "Missing timestamp"
        assert "cloud_name" in data, "Missing cloud_name"
        assert "api_key" in data, "Missing api_key"
        assert data["cloud_name"] == "grs-service", f"Expected cloud_name 'grs-service', got {data['cloud_name']}"
        assert data["folder"] == "uploads"
        print(f"SUCCESS: Cloudinary signature generated for uploads folder")

    def test_signature_with_memos_folder(self):
        """Test signature generation with memos folder (for PDF uploads)"""
        response = requests.get(
            f"{BASE_URL}/cloudinary/signature",
            params={"folder": "memos/job123", "resource_type": "raw"},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["resource_type"] == "raw", "Expected resource_type 'raw' for PDFs"
        assert data["folder"] == "memos/job123"
        print(f"SUCCESS: Cloudinary signature generated for memos/job123 folder")

    def test_signature_with_certificates_folder(self):
        """Test signature generation with certificates folder (for images)"""
        response = requests.get(
            f"{BASE_URL}/cloudinary/signature",
            params={"folder": "certificates/stone123", "resource_type": "image"},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["resource_type"] == "image"
        assert data["folder"] == "certificates/stone123"
        print(f"SUCCESS: Cloudinary signature generated for certificates/stone123 folder")

    def test_signature_rejects_invalid_folder(self):
        """Test that invalid folder paths are rejected"""
        response = requests.get(
            f"{BASE_URL}/cloudinary/signature",
            params={"folder": "invalid_folder/test", "resource_type": "image"},
            headers=self.headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid folder path" in response.json().get("detail", "")
        print(f"SUCCESS: Invalid folder path correctly rejected")

    def test_signature_requires_authentication(self):
        """Test that signature endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/cloudinary/signature",
            params={"folder": "uploads", "resource_type": "image"}
        )
        assert response.status_code == 403 or response.status_code == 401, \
            f"Expected 401/403 without auth, got {response.status_code}"
        print(f"SUCCESS: Endpoint requires authentication")


class TestJobMemoUpload:
    """Test memo upload functionality for jobs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and find a job for tests"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Could not authenticate")
        
        # Get existing jobs
        jobs_response = requests.get(f"{BASE_URL}/jobs", headers=self.headers)
        if jobs_response.status_code == 200:
            jobs = jobs_response.json()
            if jobs:
                self.job_id = jobs[0]["id"]
                self.job_number = jobs[0]["job_number"]
            else:
                pytest.skip("No jobs available for testing")
        else:
            pytest.skip("Could not fetch jobs")

    def test_upload_memo_with_cloudinary_url(self):
        """Test uploading a memo with a Cloudinary URL"""
        # Simulate what frontend does: save Cloudinary URL to backend
        test_cloudinary_url = "https://res.cloudinary.com/grs-service/raw/upload/test/memo_test.pdf"
        
        response = requests.put(
            f"{BASE_URL}/jobs/{self.job_id}/memo",
            json={
                "filename": "test_memo.pdf",
                "file_data": test_cloudinary_url
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "message" in data
        print(f"SUCCESS: Memo uploaded for job {self.job_number}")
        
        # Verify memo is saved
        job_response = requests.get(f"{BASE_URL}/jobs/{self.job_id}", headers=self.headers)
        assert job_response.status_code == 200
        job_data = job_response.json()
        assert job_data.get("signed_memo_url") == test_cloudinary_url
        print(f"SUCCESS: Memo URL saved and retrieved correctly")


class TestStoneCertificateScanUpload:
    """Test certificate scan upload for stones"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and find a stone for tests"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Could not authenticate")
        
        # Get existing stones
        stones_response = requests.get(f"{BASE_URL}/stones", headers=self.headers)
        if stones_response.status_code == 200:
            stones = stones_response.json()
            if stones:
                self.stone_id = stones[0]["id"]
                self.stone_sku = stones[0]["sku"]
                self.job_id = stones[0]["job_id"]
            else:
                pytest.skip("No stones available for testing")
        else:
            pytest.skip("Could not fetch stones")

    def test_upload_certificate_scan_with_cloudinary_url(self):
        """Test uploading a certificate scan with a Cloudinary URL"""
        test_cloudinary_url = "https://res.cloudinary.com/grs-service/image/upload/test/cert_test.jpg"
        
        response = requests.put(
            f"{BASE_URL}/stones/{self.stone_id}/certificate-scan",
            json={
                "filename": "test_cert.jpg",
                "file_data": test_cloudinary_url
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "message" in data
        print(f"SUCCESS: Certificate scan uploaded for stone {self.stone_sku}")
        
        # Verify scan is saved
        stone_response = requests.get(f"{BASE_URL}/stones/{self.stone_id}", headers=self.headers)
        assert stone_response.status_code == 200
        stone_data = stone_response.json()
        assert stone_data.get("certificate_scan_url") == test_cloudinary_url
        print(f"SUCCESS: Certificate scan URL saved and retrieved correctly")


class TestLegacyBase64Display:
    """Test that legacy base64 data still displays correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Could not authenticate")

    def test_backend_accepts_base64_data(self):
        """Test that backend still accepts base64 data for backward compatibility"""
        # Get a stone to test with
        stones_response = requests.get(f"{BASE_URL}/stones", headers=self.headers)
        if stones_response.status_code != 200 or not stones_response.json():
            pytest.skip("No stones available")
        
        stone = stones_response.json()[0]
        stone_id = stone["id"]
        
        # Test with a small base64 image (1x1 red pixel PNG)
        base64_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        
        response = requests.put(
            f"{BASE_URL}/stones/{stone_id}/certificate-scan",
            json={
                "filename": "test_base64.png",
                "file_data": base64_image
            },
            headers=self.headers
        )
        assert response.status_code == 200
        print(f"SUCCESS: Backend accepts base64 data for backward compatibility")
        
        # Verify it's saved
        stone_response = requests.get(f"{BASE_URL}/stones/{stone_id}", headers=self.headers)
        assert stone_response.status_code == 200
        assert stone_response.json().get("certificate_scan_url") == base64_image
        print(f"SUCCESS: Base64 data is stored correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
