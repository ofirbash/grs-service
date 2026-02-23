"""
Test Jobs API endpoints for GRS Global Lab Logistics
Tests: Jobs CRUD, Edit (status/notes), Stone Grouping, Memo Upload
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://lab-logistics-hub-1.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')


class TestJobsAPI:
    """Test Jobs API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_url = f"{BASE_URL}/api/auth/login"
        response = requests.post(login_url, json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@bashari.com"
        print("PASS: Login successful")
    
    def test_get_all_jobs(self):
        """Test GET /api/jobs - list all jobs"""
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        assert response.status_code == 200
        jobs = response.json()
        assert isinstance(jobs, list)
        print(f"PASS: Retrieved {len(jobs)} jobs")
        
        if len(jobs) > 0:
            # Verify job structure
            job = jobs[0]
            assert "id" in job
            assert "job_number" in job
            assert "client_id" in job
            assert "status" in job
            assert "stones" in job
            assert "total_value" in job
            assert "total_fee" in job
            print(f"PASS: Job structure verified - Job #{job['job_number']}")
        return jobs
    
    def test_get_job_by_id(self):
        """Test GET /api/jobs/{id} - get single job"""
        # First get all jobs
        jobs = self.test_get_all_jobs()
        if len(jobs) == 0:
            pytest.skip("No jobs found to test")
        
        job_id = jobs[0]["id"]
        response = requests.get(f"{BASE_URL}/api/jobs/{job_id}", headers=self.headers)
        assert response.status_code == 200
        job = response.json()
        assert job["id"] == job_id
        print(f"PASS: Retrieved job #{job['job_number']} by ID")
        return job
    
    def test_update_job_status_and_notes(self):
        """Test PUT /api/jobs/{id} - update job status and notes"""
        # Get a job to update
        jobs_response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_response.json()
        if len(jobs) == 0:
            pytest.skip("No jobs found to test")
        
        job_id = jobs[0]["id"]
        original_status = jobs[0]["status"]
        original_notes = jobs[0].get("notes", "")
        
        # Update to a new status
        new_status = "sent_to_lab" if original_status != "sent_to_lab" else "stones_accepted"
        new_notes = f"Test notes updated at {__import__('datetime').datetime.now()}"
        
        response = requests.put(
            f"{BASE_URL}/api/jobs/{job_id}",
            headers=self.headers,
            json={"status": new_status, "notes": new_notes}
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        updated_job = response.json()
        assert updated_job["status"] == new_status
        assert updated_job["notes"] == new_notes
        print(f"PASS: Job #{updated_job['job_number']} status updated to '{new_status}'")
        
        # Verify GET returns updated data
        get_response = requests.get(f"{BASE_URL}/api/jobs/{job_id}", headers=self.headers)
        assert get_response.status_code == 200
        fetched_job = get_response.json()
        assert fetched_job["status"] == new_status
        assert fetched_job["notes"] == new_notes
        print("PASS: Update verified via GET")
        
        # Restore original status
        requests.put(
            f"{BASE_URL}/api/jobs/{job_id}",
            headers=self.headers,
            json={"status": original_status, "notes": original_notes}
        )
        return updated_job
    
    def test_update_job_invalid_status(self):
        """Test PUT /api/jobs/{id} with invalid status"""
        jobs_response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_response.json()
        if len(jobs) == 0:
            pytest.skip("No jobs found to test")
        
        job_id = jobs[0]["id"]
        response = requests.put(
            f"{BASE_URL}/api/jobs/{job_id}",
            headers=self.headers,
            json={"status": "invalid_status_xyz"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid status, got {response.status_code}"
        print("PASS: Invalid status rejected with 400")
    
    def test_group_stones_for_certificate(self):
        """Test PUT /api/jobs/{id}/group-stones - group stones for single certificate"""
        # Get a job with stones
        jobs_response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_response.json()
        
        # Find a job with multiple stones
        job_with_stones = None
        for job in jobs:
            if len(job.get("stones", [])) >= 2:
                job_with_stones = job
                break
        
        if not job_with_stones:
            pytest.skip("No job with multiple stones found")
        
        job_id = job_with_stones["id"]
        stones = job_with_stones["stones"]
        stone_ids = [s["id"] for s in stones[:2]]  # Group first 2 stones
        
        response = requests.put(
            f"{BASE_URL}/api/jobs/{job_id}/group-stones",
            headers=self.headers,
            json={"stone_ids": stone_ids, "group_number": 99}  # Use 99 to avoid conflicts
        )
        assert response.status_code == 200, f"Group stones failed: {response.text}"
        
        result = response.json()
        assert "message" in result
        assert "Grouped" in result["message"] or "grouped" in result["message"].lower()
        print(f"PASS: Grouped {len(stone_ids)} stones for certificate")
        
        # Verify grouping via GET
        get_response = requests.get(f"{BASE_URL}/api/jobs/{job_id}", headers=self.headers)
        assert get_response.status_code == 200
        updated_job = get_response.json()
        
        for stone in updated_job["stones"]:
            if stone["id"] in stone_ids:
                assert stone.get("certificate_group") == 99, f"Stone {stone['id']} not grouped"
        print("PASS: Stone grouping verified via GET")
        return result
    
    def test_group_stones_max_limit(self):
        """Test PUT /api/jobs/{id}/group-stones with >30 stones fails"""
        jobs_response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_response.json()
        if len(jobs) == 0:
            pytest.skip("No jobs found to test")
        
        job_id = jobs[0]["id"]
        # Try to group 31 fake stone IDs
        fake_stone_ids = [f"fake_stone_{i}" for i in range(31)]
        
        response = requests.put(
            f"{BASE_URL}/api/jobs/{job_id}/group-stones",
            headers=self.headers,
            json={"stone_ids": fake_stone_ids, "group_number": 1}
        )
        assert response.status_code == 400, f"Expected 400 for >30 stones, got {response.status_code}"
        print("PASS: Grouping >30 stones rejected with 400")
    
    def test_upload_memo(self):
        """Test PUT /api/jobs/{id}/memo - upload signed memo"""
        jobs_response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_response.json()
        if len(jobs) == 0:
            pytest.skip("No jobs found to test")
        
        job_id = jobs[0]["id"]
        
        # Upload a mock memo (base64 data)
        mock_file_data = "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyA+PgplbmRvYmoKMiAwIG9iago8PCAvVHlwZSAvUGFnZXMgPj4KZW5kb2JqCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgPj4KJSVFT0Y="
        
        response = requests.put(
            f"{BASE_URL}/api/jobs/{job_id}/memo",
            headers=self.headers,
            json={"filename": "test_memo.pdf", "file_data": mock_file_data}
        )
        assert response.status_code == 200, f"Memo upload failed: {response.text}"
        
        result = response.json()
        assert "message" in result
        assert result["filename"] == "test_memo.pdf"
        print(f"PASS: Memo uploaded successfully")
        return result
    
    def test_valid_statuses(self):
        """Test all valid job statuses"""
        valid_statuses = [
            "received", "stones_accepted", "sent_to_lab", "verbal_uploaded",
            "stones_returned", "certificates_scanned", "certificates_sent", "done"
        ]
        
        jobs_response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_response.json()
        if len(jobs) == 0:
            pytest.skip("No jobs found to test")
        
        job_id = jobs[0]["id"]
        original_status = jobs[0]["status"]
        
        # Test updating to each valid status
        for status in valid_statuses:
            response = requests.put(
                f"{BASE_URL}/api/jobs/{job_id}",
                headers=self.headers,
                json={"status": status}
            )
            assert response.status_code == 200, f"Failed to set status '{status}': {response.text}"
        
        print(f"PASS: All {len(valid_statuses)} valid statuses accepted")
        
        # Restore original
        requests.put(
            f"{BASE_URL}/api/jobs/{job_id}",
            headers=self.headers,
            json={"status": original_status}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
