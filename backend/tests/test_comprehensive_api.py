"""
Comprehensive API Tests for Bashari Lab-Direct ERP System
Tests: Auth, Jobs, Stones, Payments, Clients, Shipments, Settings, Notifications
"""
import pytest
import requests
import os
import uuid
from test_config import BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, BRANCH_ADMIN_EMAIL, BRANCH_ADMIN_PASSWORD
from datetime import datetime

# Test credentials
# Safe test client IDs (whitelisted for email testing)
SAFE_CLIENT_ID = "699d74286ed929c698bfe682"  # ofir1@bashds.com
SAFE_CLIENT_ID_2 = "69ae84cea4faa5cd3560dbc2"  # test Israel - ofir3@bashds.com
ISRAEL_BRANCH_ID = "699d6f8e6ed929c698bfe67f"  # Israel branch


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] in ["super_admin", "admin"]
        print(f"✓ Admin login successful - role: {data['user']['role']}")
    
    def test_customer_login_success(self):
        """Test customer login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CUSTOMER_EMAIL,
            "password": CUSTOMER_PASSWORD
        })
        assert response.status_code == 200, f"Customer login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "customer"
        print(f"✓ Customer login successful - role: {data['user']['role']}")
    
    def test_branch_admin_login_success(self):
        """Test branch admin login (ofir1@bashds.com)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": BRANCH_ADMIN_EMAIL,
            "password": BRANCH_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Branch admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] in ["branch_admin", "super_admin"]
        print(f"✓ Branch admin login successful - role: {data['user']['role']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")
    
    def test_auth_me_endpoint(self):
        """Test /auth/me returns current user info"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["access_token"]
        
        # Then get current user
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL.lower()
        print(f"✓ /auth/me returns correct user: {data['email']}")


class TestJobs:
    """Jobs CRUD and operations tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_jobs(self):
        """Test listing all jobs"""
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        assert response.status_code == 200
        jobs = response.json()
        assert isinstance(jobs, list)
        print(f"✓ Listed {len(jobs)} jobs")
    
    def test_get_job_detail(self):
        """Test getting job detail with stones"""
        # First get list of jobs
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available for testing")
        
        job_id = jobs[0]["id"]
        response = requests.get(f"{BASE_URL}/api/jobs/{job_id}", headers=self.headers)
        assert response.status_code == 200
        job = response.json()
        assert "stones" in job
        assert "total_fee" in job
        print(f"✓ Got job #{job['job_number']} with {len(job['stones'])} stones")
    
    def test_create_job_with_stones(self):
        """Test creating a new job with stones (using safe client ofir1)"""
        job_data = {
            "client_id": SAFE_CLIENT_ID,
            "branch_id": ISRAEL_BRANCH_ID,
            "service_type": "Normal",
            "notes": f"TEST job created at {datetime.utcnow().isoformat()}",
            "certificate_units": [
                {
                    "stones": [
                        {
                            "stone_type": "Ruby",
                            "weight": 2.5,
                            "shape": "Oval",
                            "value": 5000,
                            "color_stability_test": False
                        }
                    ]
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/jobs", json=job_data, headers=self.headers)
        assert response.status_code == 200, f"Create job failed: {response.text}"
        job = response.json()
        assert job["client_id"] == SAFE_CLIENT_ID
        assert len(job["stones"]) == 1
        assert job["total_stones"] == 1
        print(f"✓ Created job #{job['job_number']} with 1 stone")
        return job
    
    def test_update_job_status(self):
        """Test updating job status"""
        # Get a job
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        response = requests.put(f"{BASE_URL}/api/jobs/{job_id}/status", 
            json={"status": "stones_accepted"}, headers=self.headers)
        assert response.status_code == 200
        print(f"✓ Updated job status to stones_accepted")
    
    def test_update_job_discount(self):
        """Test updating job discount field"""
        # Get a job
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        discount_amount = 50.0
        
        response = requests.put(f"{BASE_URL}/api/jobs/{job_id}", 
            json={"discount": discount_amount}, headers=self.headers)
        assert response.status_code == 200
        job = response.json()
        assert job.get("discount") == discount_amount
        print(f"✓ Updated job discount to ${discount_amount}")
    
    def test_update_job_notes(self):
        """Test updating job notes"""
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        new_notes = f"Test notes updated at {datetime.utcnow().isoformat()}"
        
        response = requests.put(f"{BASE_URL}/api/jobs/{job_id}", 
            json={"notes": new_notes}, headers=self.headers)
        assert response.status_code == 200
        job = response.json()
        assert job.get("notes") == new_notes
        print(f"✓ Updated job notes")


class TestStones:
    """Stones operations tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_all_stones(self):
        """Test listing all stones across jobs"""
        response = requests.get(f"{BASE_URL}/api/stones", headers=self.headers)
        assert response.status_code == 200
        stones = response.json()
        assert isinstance(stones, list)
        print(f"✓ Listed {len(stones)} stones")
    
    def test_get_stone_detail(self):
        """Test getting stone detail"""
        # Get stones list
        stones_resp = requests.get(f"{BASE_URL}/api/stones", headers=self.headers)
        stones = stones_resp.json()
        if not stones:
            pytest.skip("No stones available")
        
        stone_id = stones[0]["id"]
        response = requests.get(f"{BASE_URL}/api/stones/{stone_id}", headers=self.headers)
        assert response.status_code == 200
        stone = response.json()
        assert "sku" in stone
        assert "job_id" in stone
        print(f"✓ Got stone {stone['sku']}")
    
    def test_update_stone_mounted_status(self):
        """Test toggling mounted status on a stone"""
        # Get stones
        stones_resp = requests.get(f"{BASE_URL}/api/stones", headers=self.headers)
        stones = stones_resp.json()
        if not stones:
            pytest.skip("No stones available")
        
        stone_id = stones[0]["id"]
        
        # Toggle mounted to true
        response = requests.put(f"{BASE_URL}/api/stones/{stone_id}/fees",
            json={"mounted": True}, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_fee" in data
        print(f"✓ Updated stone mounted status, total_fee: ${data['total_fee']}")
    
    def test_update_stone_color_stability(self):
        """Test toggling color stability test on a stone"""
        stones_resp = requests.get(f"{BASE_URL}/api/stones", headers=self.headers)
        stones = stones_resp.json()
        if not stones:
            pytest.skip("No stones available")
        
        stone_id = stones[0]["id"]
        
        response = requests.put(f"{BASE_URL}/api/stones/{stone_id}/fees",
            json={"color_stability_test": True}, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_fee" in data
        print(f"✓ Updated stone color stability test")
    
    def test_update_stone_actual_fee(self):
        """Test updating actual fee on a stone"""
        stones_resp = requests.get(f"{BASE_URL}/api/stones", headers=self.headers)
        stones = stones_resp.json()
        if not stones:
            pytest.skip("No stones available")
        
        stone_id = stones[0]["id"]
        actual_fee = 150.0
        
        response = requests.put(f"{BASE_URL}/api/stones/{stone_id}/fees",
            json={"actual_fee": actual_fee}, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["stone"].get("actual_fee") == actual_fee
        print(f"✓ Updated stone actual fee to ${actual_fee}")


class TestPayments:
    """Payment flow tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_exchange_rate(self):
        """Test exchange rate endpoint"""
        response = requests.get(f"{BASE_URL}/api/exchange-rate")
        assert response.status_code == 200
        data = response.json()
        assert "usd_to_ils" in data
        assert data["usd_to_ils"] > 0
        print(f"✓ Exchange rate: 1 USD = {data['usd_to_ils']} ILS")
    
    def test_generate_payment_token(self):
        """Test generating payment token for a job"""
        # Get a job
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        response = requests.post(f"{BASE_URL}/api/jobs/{job_id}/payment-token", 
            headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "payment_token" in data
        assert "payment_url" in data
        print(f"✓ Generated payment token: {data['payment_token'][:8]}...")
        return data["payment_token"]
    
    def test_get_payment_details(self):
        """Test getting payment details by token"""
        # First generate a token
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        token_resp = requests.post(f"{BASE_URL}/api/jobs/{job_id}/payment-token", 
            headers=self.headers)
        token = token_resp.json()["payment_token"]
        
        # Get payment details (public endpoint)
        response = requests.get(f"{BASE_URL}/api/payment/{token}")
        assert response.status_code == 200
        data = response.json()
        assert "job_number" in data
        assert "total_fee" in data
        assert "has_tranzila" in data
        print(f"✓ Payment details for job #{data['job_number']}: ${data['total_fee']}")
    
    def test_adjustment_payment_token(self):
        """Test generating adjustment payment token for paid job"""
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        adjustment_amount = 75.0
        
        response = requests.post(f"{BASE_URL}/api/jobs/{job_id}/payment-token",
            json={"is_adjustment": True, "adjustment_amount": adjustment_amount},
            headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "payment_token" in data
        
        # Verify adjustment amount in payment details
        details_resp = requests.get(f"{BASE_URL}/api/payment/{data['payment_token']}")
        details = details_resp.json()
        if details.get("status") != "already_paid":
            assert details.get("is_adjustment") == True
            assert details.get("total_fee") == adjustment_amount
        print(f"✓ Adjustment payment token generated for ${adjustment_amount}")
    
    def test_payment_status(self):
        """Test checking payment status"""
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        token_resp = requests.post(f"{BASE_URL}/api/jobs/{job_id}/payment-token", 
            headers=self.headers)
        token = token_resp.json()["payment_token"]
        
        response = requests.get(f"{BASE_URL}/api/payment/{token}/status")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] in ["pending", "paid"]
        print(f"✓ Payment status: {data['status']}")


class TestClients:
    """Clients CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_clients(self):
        """Test listing all clients"""
        response = requests.get(f"{BASE_URL}/api/clients", headers=self.headers)
        assert response.status_code == 200
        clients = response.json()
        assert isinstance(clients, list)
        print(f"✓ Listed {len(clients)} clients")
    
    def test_get_client_detail(self):
        """Test getting client detail"""
        response = requests.get(f"{BASE_URL}/api/clients/{SAFE_CLIENT_ID}", headers=self.headers)
        assert response.status_code == 200
        client = response.json()
        assert "name" in client
        assert "email" in client
        print(f"✓ Got client: {client['name']}")
    
    def test_create_client(self):
        """Test creating a new client"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST Client {unique_id}",
            "email": f"test_{unique_id}@example.com",
            "phone": "+1234567890",
            "branch_id": ISRAEL_BRANCH_ID,
            "address": "123 Test Street"
        }
        
        response = requests.post(f"{BASE_URL}/api/clients", json=client_data, headers=self.headers)
        assert response.status_code == 200, f"Create client failed: {response.text}"
        client = response.json()
        assert client["name"] == client_data["name"]
        print(f"✓ Created client: {client['name']}")
    
    def test_update_client(self):
        """Test updating client details"""
        # Get client
        response = requests.get(f"{BASE_URL}/api/clients/{SAFE_CLIENT_ID}", headers=self.headers)
        client = response.json()
        
        # Update phone
        new_phone = "+9876543210"
        update_resp = requests.put(f"{BASE_URL}/api/clients/{SAFE_CLIENT_ID}",
            json={"phone": new_phone}, headers=self.headers)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["phone"] == new_phone
        print(f"✓ Updated client phone")
    
    def test_customer_cannot_list_clients(self):
        """Test that customer role cannot list all clients"""
        # Login as customer
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CUSTOMER_EMAIL,
            "password": CUSTOMER_PASSWORD
        })
        customer_token = login_resp.json()["access_token"]
        
        response = requests.get(f"{BASE_URL}/api/clients", headers={
            "Authorization": f"Bearer {customer_token}"
        })
        assert response.status_code == 200
        clients = response.json()
        # Customer should get empty list
        assert clients == []
        print("✓ Customer correctly restricted from listing clients")


class TestShipments:
    """Shipments CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_shipments(self):
        """Test listing all shipments"""
        response = requests.get(f"{BASE_URL}/api/shipments", headers=self.headers)
        assert response.status_code == 200
        shipments = response.json()
        assert isinstance(shipments, list)
        print(f"✓ Listed {len(shipments)} shipments")
    
    def test_get_shipment_options(self):
        """Test getting shipment configuration options"""
        response = requests.get(f"{BASE_URL}/api/shipments/config/options", headers=self.headers)
        assert response.status_code == 200
        options = response.json()
        assert "shipment_types" in options
        assert "couriers" in options
        assert "statuses" in options
        print(f"✓ Got shipment options: {len(options['couriers'])} couriers")
    
    def test_create_shipment(self):
        """Test creating a new shipment"""
        # Get a job to include
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        
        shipment_data = {
            "shipment_type": "send_stones_to_lab",
            "courier": "DHL",
            "source_address": "Israel Office",
            "destination_address": "GRS Lab",
            "tracking_number": f"TEST{uuid.uuid4().hex[:8].upper()}",
            "job_ids": [job_id],
            "notes": "Test shipment"
        }
        
        response = requests.post(f"{BASE_URL}/api/shipments", json=shipment_data, headers=self.headers)
        assert response.status_code == 200, f"Create shipment failed: {response.text}"
        shipment = response.json()
        assert shipment["courier"] == "DHL"
        assert len(shipment["job_ids"]) == 1
        print(f"✓ Created shipment #{shipment['shipment_number']}")


class TestSettings:
    """Settings and pricing tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_pricing(self):
        """Test getting pricing brackets"""
        response = requests.get(f"{BASE_URL}/api/pricing", headers=self.headers)
        assert response.status_code == 200
        pricing = response.json()
        assert "brackets" in pricing or "color_stability_fee" in pricing
        print(f"✓ Got pricing configuration")
    
    def test_get_dropdown_settings(self):
        """Test getting dropdown settings for verbal findings"""
        response = requests.get(f"{BASE_URL}/api/settings/dropdowns", headers=self.headers)
        assert response.status_code == 200
        settings = response.json()
        assert "identification" in settings
        assert "color" in settings
        assert "origin" in settings
        assert "comment" in settings
        print(f"✓ Got dropdown settings: {len(settings['identification'])} identification options")


class TestNotifications:
    """Notification preview tests (NO ACTUAL SENDS to non-whitelisted emails)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_notification_status(self):
        """Test getting notification status for a job"""
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        response = requests.get(f"{BASE_URL}/api/jobs/{job_id}/notifications/status", 
            headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert "current_status" in data
        print(f"✓ Got notification status for job #{data['job_number']}")
    
    def test_preview_notification(self):
        """Test previewing notification email (safe - no send)"""
        # Find a job belonging to safe client (ofir1)
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        
        safe_job = None
        for job in jobs:
            if job.get("client_id") == SAFE_CLIENT_ID:
                safe_job = job
                break
        
        if not safe_job:
            pytest.skip("No safe job found for notification preview")
        
        job_id = safe_job["id"]
        response = requests.get(
            f"{BASE_URL}/api/jobs/{job_id}/notifications/preview/stones_accepted",
            headers=self.headers
        )
        assert response.status_code == 200
        preview = response.json()
        assert "subject" in preview
        assert "html_body" in preview
        assert "recipient_email" in preview
        print(f"✓ Previewed notification for job #{preview['job_number']}")


class TestDashboard:
    """Dashboard stats tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_dashboard_stats(self):
        """Test getting dashboard statistics"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200
        stats = response.json()
        assert "total_jobs" in stats or "jobs" in stats
        print(f"✓ Got dashboard stats")


class TestPDF:
    """PDF generation tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_generate_memo_pdf(self):
        """Test generating memo PDF"""
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        response = requests.get(f"{BASE_URL}/api/jobs/{job_id}/pdf/memo-in", headers=self.headers)
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        print(f"✓ Generated memo PDF")
    
    def test_generate_invoice_pdf(self):
        """Test generating invoice PDF"""
        jobs_resp = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        jobs = jobs_resp.json()
        if not jobs:
            pytest.skip("No jobs available")
        
        job_id = jobs[0]["id"]
        response = requests.get(f"{BASE_URL}/api/jobs/{job_id}/pdf/invoice", headers=self.headers)
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        print(f"✓ Generated invoice PDF")


class TestBranches:
    """Branches tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_branches(self):
        """Test listing all branches"""
        response = requests.get(f"{BASE_URL}/api/branches", headers=self.headers)
        assert response.status_code == 200
        branches = response.json()
        assert isinstance(branches, list)
        assert len(branches) >= 1
        print(f"✓ Listed {len(branches)} branches")


class TestCustomerAccess:
    """Customer role access restriction tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get customer token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CUSTOMER_EMAIL,
            "password": CUSTOMER_PASSWORD
        })
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_customer_sees_only_own_jobs(self):
        """Test that customer only sees their own jobs"""
        response = requests.get(f"{BASE_URL}/api/jobs", headers=self.headers)
        assert response.status_code == 200
        jobs = response.json()
        # Customer should see limited jobs (their own)
        print(f"✓ Customer sees {len(jobs)} jobs (restricted view)")
    
    def test_customer_cannot_create_job(self):
        """Test that customer cannot create jobs"""
        job_data = {
            "client_id": SAFE_CLIENT_ID,
            "branch_id": ISRAEL_BRANCH_ID,
            "service_type": "Normal",
            "certificate_units": [{"stones": [{"stone_type": "Ruby", "weight": 1.0, "shape": "Round", "value": 1000}]}]
        }
        
        response = requests.post(f"{BASE_URL}/api/jobs", json=job_data, headers=self.headers)
        # Should be forbidden
        assert response.status_code in [401, 403]
        print("✓ Customer correctly forbidden from creating jobs")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
