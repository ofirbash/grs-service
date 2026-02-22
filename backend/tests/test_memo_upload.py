"""
Test memo upload functionality for jobs.
This tests the fix where signed_memo_url and signed_memo_filename 
were added to the JobResponse model and API functions.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bashari-lab-system.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')


class TestMemoUpload:
    """Test memo upload on Jobs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@bashari.com", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        self.token = data.get("access_token")
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_jobs_api_returns_signed_memo_fields(self):
        """Test that GET /api/jobs returns signed_memo_url and signed_memo_filename"""
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers=self.headers
        )
        assert response.status_code == 200
        jobs = response.json()
        
        # Find Job #17 which should have a memo
        job17 = next((j for j in jobs if j.get('job_number') == 17), None)
        assert job17 is not None, "Job #17 not found"
        
        # Verify signed_memo_url and signed_memo_filename are in response
        assert 'signed_memo_url' in job17, "signed_memo_url field missing from response"
        assert 'signed_memo_filename' in job17, "signed_memo_filename field missing from response"
        
        # Verify they have values (not None or empty)
        assert job17['signed_memo_url'] is not None, "signed_memo_url should not be None"
        assert job17['signed_memo_filename'] is not None, "signed_memo_filename should not be None"
        
        print(f"Job #17 memo: filename={job17['signed_memo_filename']}, url_length={len(job17['signed_memo_url']) if job17['signed_memo_url'] else 0}")
    
    def test_job17_has_memo(self):
        """Verify Job #17 has memo data"""
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers=self.headers
        )
        assert response.status_code == 200
        jobs = response.json()
        
        job17 = next((j for j in jobs if j.get('job_number') == 17), None)
        assert job17 is not None
        
        # Check memo exists
        assert job17.get('signed_memo_url'), "Job #17 should have signed_memo_url"
        assert 'fixed_test_memo.pdf' in str(job17.get('signed_memo_filename', '')), \
            f"Expected 'fixed_test_memo.pdf', got: {job17.get('signed_memo_filename')}"
    
    def test_job16_has_memo(self):
        """Verify Job #16 has memo data"""
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers=self.headers
        )
        assert response.status_code == 200
        jobs = response.json()
        
        job16 = next((j for j in jobs if j.get('job_number') == 16), None)
        assert job16 is not None
        
        # Check memo exists
        assert job16.get('signed_memo_url'), "Job #16 should have signed_memo_url"
        assert 'test_memo' in str(job16.get('signed_memo_filename', '')).lower(), \
            f"Expected 'test_memo' in filename, got: {job16.get('signed_memo_filename')}"
    
    def test_single_job_api_returns_memo_fields(self):
        """Test that GET /api/jobs/{job_id} returns memo fields"""
        # First get job IDs
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers=self.headers
        )
        assert response.status_code == 200
        jobs = response.json()
        
        job17 = next((j for j in jobs if j.get('job_number') == 17), None)
        assert job17 is not None
        
        # Now get single job
        job_id = job17['id']
        response = requests.get(
            f"{BASE_URL}/api/jobs/{job_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        job = response.json()
        
        # Verify memo fields exist
        assert 'signed_memo_url' in job, "signed_memo_url missing from single job response"
        assert 'signed_memo_filename' in job, "signed_memo_filename missing from single job response"
        assert job['signed_memo_url'] is not None
        assert job['signed_memo_filename'] is not None
    
    def test_memo_upload_api(self):
        """Test PUT /api/jobs/{job_id}/memo endpoint"""
        # Get a job first
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers=self.headers
        )
        assert response.status_code == 200
        jobs = response.json()
        
        # Use job #15 for testing new upload (if it doesn't have one)
        job15 = next((j for j in jobs if j.get('job_number') == 15), None)
        if job15:
            job_id = job15['id']
            
            # Upload a test memo
            test_memo = {
                "filename": "TEST_new_memo.pdf",
                "file_data": "data:application/pdf;base64,JVBERi0xLjQgVGVzdA=="
            }
            
            response = requests.put(
                f"{BASE_URL}/api/jobs/{job_id}/memo",
                json=test_memo,
                headers=self.headers
            )
            assert response.status_code == 200
            result = response.json()
            assert "message" in result
            assert result.get("filename") == "TEST_new_memo.pdf"
            
            # Verify it was saved by fetching the job again
            response = requests.get(
                f"{BASE_URL}/api/jobs/{job_id}",
                headers=self.headers
            )
            assert response.status_code == 200
            updated_job = response.json()
            assert updated_job.get('signed_memo_url') == test_memo['file_data']
            assert updated_job.get('signed_memo_filename') == test_memo['filename']


class TestJobResponseModel:
    """Test JobResponse Pydantic model fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@bashari.com", "password": "admin123"}
        )
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_job_response_includes_all_expected_fields(self):
        """Verify JobResponse includes signed_memo_url and signed_memo_filename"""
        response = requests.get(
            f"{BASE_URL}/api/jobs",
            headers=self.headers
        )
        assert response.status_code == 200
        jobs = response.json()
        
        assert len(jobs) > 0, "No jobs found"
        job = jobs[0]
        
        # Check all expected fields exist in JobResponse
        expected_fields = [
            'id', 'job_number', 'client_id', 'branch_id', 'service_type',
            'status', 'stones', 'total_stones', 'total_value', 'total_fee',
            'created_at', 'updated_at',
            'signed_memo_url',  # This was the bug - missing from response
            'signed_memo_filename'  # This was the bug - missing from response
        ]
        
        for field in expected_fields:
            assert field in job, f"Field '{field}' missing from JobResponse"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
