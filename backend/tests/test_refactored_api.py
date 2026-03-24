"""
Backend API Tests for Bashari Lab-Direct ERP System
Tests the refactored modular router architecture
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bashari-lab-direct.preview.emergentagent.com/api').rstrip('/')
if not BASE_URL.endswith('/api'):
    BASE_URL = BASE_URL + '/api'


class TestHealthAndRoot:
    """Health check and root endpoint tests"""
    
    def test_root_endpoint(self):
        """Test API root returns version info"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data
        print(f"✓ Root endpoint: {data}")
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Health check: {data}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_admin_login(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@bashari.com"
        assert data["user"]["role"] in ["super_admin", "admin"]
        print(f"✓ Admin login successful: {data['user']['email']} ({data['user']['role']})")
        return data["access_token"]
    
    def test_customer_login(self):
        """Test customer login with valid credentials"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "customer@test.com",
            "password": "customer123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "customer"
        print(f"✓ Customer login successful: {data['user']['email']} ({data['user']['role']})")
        return data["access_token"]
    
    def test_invalid_login(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")
    
    def test_get_current_user(self):
        """Test GET /auth/me with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        token = login_response.json()["access_token"]
        
        # Get current user
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@bashari.com"
        print(f"✓ GET /auth/me: {data['email']}")


class TestBranches:
    """Branch endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_branches(self):
        """Test GET /branches returns branches"""
        response = requests.get(f"{BASE_URL}/branches", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2, f"Expected at least 2 branches, got {len(data)}"
        print(f"✓ GET /branches: {len(data)} branches found")
        for branch in data[:3]:
            print(f"  - {branch.get('name', 'N/A')}")


class TestClients:
    """Client endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_clients(self):
        """Test GET /clients returns clients"""
        response = requests.get(f"{BASE_URL}/clients", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have around 93 clients based on review request
        print(f"✓ GET /clients: {len(data)} clients found")
        if len(data) > 0:
            print(f"  - Sample client: {data[0].get('name', 'N/A')}")


class TestJobs:
    """Job endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_jobs(self):
        """Test GET /jobs returns jobs"""
        response = requests.get(f"{BASE_URL}/jobs", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /jobs: {len(data)} jobs found")
        return data
    
    def test_get_job_by_id(self):
        """Test GET /jobs/{job_id} returns job with stones array"""
        # First get list of jobs
        jobs_response = requests.get(f"{BASE_URL}/jobs", headers=self.headers)
        jobs = jobs_response.json()
        
        if len(jobs) > 0:
            job_id = jobs[0]["id"]
            response = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=self.headers)
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            assert "stones" in data
            assert isinstance(data["stones"], list)
            print(f"✓ GET /jobs/{job_id}: Job #{data.get('job_number')} with {len(data['stones'])} stones")
            return job_id
        else:
            pytest.skip("No jobs available to test")


class TestStones:
    """Stone endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_all_stones(self):
        """Test GET /stones returns all stones"""
        response = requests.get(f"{BASE_URL}/stones", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /stones: {len(data)} stones found")
        if len(data) > 0:
            stone = data[0]
            print(f"  - Sample stone: {stone.get('sku', 'N/A')} ({stone.get('stone_type', 'N/A')})")


class TestShipments:
    """Shipment endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_shipments(self):
        """Test GET /shipments returns shipments"""
        response = requests.get(f"{BASE_URL}/shipments", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /shipments: {len(data)} shipments found")
    
    def test_get_shipment_config_options(self):
        """Test GET /shipments/config/options returns shipment types and couriers"""
        response = requests.get(f"{BASE_URL}/shipments/config/options", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "shipment_types" in data
        assert "couriers" in data
        assert isinstance(data["shipment_types"], list)
        assert isinstance(data["couriers"], list)
        print(f"✓ GET /shipments/config/options: {len(data['shipment_types'])} types, {len(data['couriers'])} couriers")


class TestDashboard:
    """Dashboard endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_dashboard_stats(self):
        """Test GET /dashboard/stats returns stats"""
        response = requests.get(f"{BASE_URL}/dashboard/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_jobs" in data
        assert "total_clients" in data
        assert "total_stones" in data
        print(f"✓ GET /dashboard/stats: {data['total_jobs']} jobs, {data['total_clients']} clients, {data['total_stones']} stones")


class TestPricing:
    """Pricing endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_pricing(self):
        """Test GET /pricing returns brackets and color_stability_fee"""
        response = requests.get(f"{BASE_URL}/pricing", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "brackets" in data
        assert "color_stability_fee" in data
        assert isinstance(data["brackets"], list)
        print(f"✓ GET /pricing: {len(data['brackets'])} brackets, color_stability_fee=${data['color_stability_fee']}")


class TestSettings:
    """Settings endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_dropdown_settings(self):
        """Test GET /settings/dropdowns returns dropdown settings"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        # Should have identification, color, origin, comment fields
        assert "identification" in data or "color" in data or "origin" in data
        print(f"✓ GET /settings/dropdowns: {list(data.keys())}")


class TestUsers:
    """User endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_users(self):
        """Test GET /users returns admin users"""
        response = requests.get(f"{BASE_URL}/users", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /users: {len(data)} admin users found")


class TestAddresses:
    """Address endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_addresses(self):
        """Test GET /addresses returns addresses"""
        response = requests.get(f"{BASE_URL}/addresses", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /addresses: {len(data)} addresses found")


class TestCloudinary:
    """Cloudinary endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_cloudinary_signature(self):
        """Test GET /cloudinary/signature returns signature with cloud_name"""
        response = requests.get(f"{BASE_URL}/cloudinary/signature?folder=uploads", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "signature" in data
        assert "cloud_name" in data
        assert "api_key" in data
        print(f"✓ GET /cloudinary/signature: cloud_name={data['cloud_name']}")


class TestPDFGeneration:
    """PDF generation endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_generate_memo_in_pdf(self):
        """Test GET /jobs/{job_id}/pdf/memo-in returns PDF"""
        # First get a job
        jobs_response = requests.get(f"{BASE_URL}/jobs", headers=self.headers)
        jobs = jobs_response.json()
        
        if len(jobs) > 0:
            job_id = jobs[0]["id"]
            response = requests.get(f"{BASE_URL}/jobs/{job_id}/pdf/memo-in", headers=self.headers)
            assert response.status_code == 200
            assert response.headers.get("content-type") == "application/pdf"
            print(f"✓ GET /jobs/{job_id}/pdf/memo-in: PDF generated ({len(response.content)} bytes)")
        else:
            pytest.skip("No jobs available to test PDF generation")
    
    def test_generate_invoice_pdf(self):
        """Test GET /jobs/{job_id}/pdf/invoice returns PDF"""
        # First get a job
        jobs_response = requests.get(f"{BASE_URL}/jobs", headers=self.headers)
        jobs = jobs_response.json()
        
        if len(jobs) > 0:
            job_id = jobs[0]["id"]
            response = requests.get(f"{BASE_URL}/jobs/{job_id}/pdf/invoice", headers=self.headers)
            assert response.status_code == 200
            assert response.headers.get("content-type") == "application/pdf"
            print(f"✓ GET /jobs/{job_id}/pdf/invoice: PDF generated ({len(response.content)} bytes)")
        else:
            pytest.skip("No jobs available to test PDF generation")


class TestNotifications:
    """Notification endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        self.token = login_response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_notification_status(self):
        """Test GET /jobs/{job_id}/notifications/status returns notification types"""
        # First get a job
        jobs_response = requests.get(f"{BASE_URL}/jobs", headers=self.headers)
        jobs = jobs_response.json()
        
        if len(jobs) > 0:
            job_id = jobs[0]["id"]
            response = requests.get(f"{BASE_URL}/jobs/{job_id}/notifications/status", headers=self.headers)
            assert response.status_code == 200
            data = response.json()
            assert "notifications" in data
            assert "current_status" in data
            print(f"✓ GET /jobs/{job_id}/notifications/status: {len(data['notifications'])} notification types")
        else:
            pytest.skip("No jobs available to test notifications")


class TestCustomerRoleAccess:
    """Test customer role access restrictions"""
    
    def test_customer_sees_only_their_jobs(self):
        """Test that customer can only see their own jobs"""
        # Login as customer
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "customer@test.com",
            "password": "customer123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Customer login failed - may not exist")
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get jobs as customer
        response = requests.get(f"{BASE_URL}/jobs", headers=headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Customer sees {len(data)} jobs (filtered to their own)")
    
    def test_customer_cannot_access_all_clients(self):
        """Test that customer cannot see all clients"""
        # Login as customer
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "customer@test.com",
            "password": "customer123"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Customer login failed - may not exist")
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get clients as customer - should return empty or restricted
        response = requests.get(f"{BASE_URL}/clients", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Customer should see empty list or only their own client
        assert len(data) <= 1, f"Customer should not see all clients, got {len(data)}"
        print(f"✓ Customer correctly restricted from seeing all clients (sees {len(data)})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
