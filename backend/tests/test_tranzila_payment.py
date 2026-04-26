"""
Test Tranzila Payment Gateway Integration
Tests: Payment token generation, payment details, handshake, status, simulate
"""
import pytest
import requests
import os
import uuid
from test_config import BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, BRANCH_ADMIN_EMAIL, BRANCH_ADMIN_PASSWORD

# Test credentials
TEST_JOB_ID = "69b67dac4d2b625c24832749"


class TestAuthLogin:
    """Test authentication for payment operations"""
    
    def test_admin_login_returns_token(self):
        """POST /api/auth/login with admin credentials returns access token"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert isinstance(data["access_token"], str)
        assert len(data["access_token"]) > 0
        print(f"✓ Admin login successful, token received")


class TestExchangeRate:
    """Test exchange rate endpoint"""
    
    def test_get_exchange_rate(self):
        """GET /api/exchange-rate returns USD to ILS rate"""
        response = requests.get(f"{BASE_URL}/exchange-rate")
        assert response.status_code == 200, f"Exchange rate failed: {response.text}"
        data = response.json()
        assert "usd_to_ils" in data, "Response missing usd_to_ils"
        assert isinstance(data["usd_to_ils"], (int, float))
        assert data["usd_to_ils"] > 0, "Exchange rate should be positive"
        assert "source" in data, "Response missing source"
        print(f"✓ Exchange rate: 1 USD = {data['usd_to_ils']} ILS (source: {data['source']})")


class TestPaymentTokenGeneration:
    """Test payment token generation for jobs"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_generate_payment_token(self, auth_token):
        """POST /api/jobs/{job_id}/payment-token generates payment token and URL"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.post(f"{BASE_URL}/jobs/{TEST_JOB_ID}/payment-token", headers=headers)
        assert response.status_code == 200, f"Payment token generation failed: {response.text}"
        data = response.json()
        assert "payment_token" in data, "Response missing payment_token"
        assert "payment_url" in data, "Response missing payment_url"
        assert isinstance(data["payment_token"], str)
        assert len(data["payment_token"]) > 0
        assert "/pay" in data["payment_url"], "Payment URL should contain the /pay route"
        assert "token" in data["payment_url"], "Payment URL should reference the token"
        print(f"✓ Payment token generated: {data['payment_token'][:8]}...")
        print(f"✓ Payment URL: {data['payment_url']}")
        return data["payment_token"]


class TestPaymentDetails:
    """Test payment details retrieval"""
    
    @pytest.fixture
    def payment_token(self):
        """Get payment token for test job"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip("Authentication failed")
        auth_token = login_resp.json().get("access_token")
        
        # Generate payment token
        headers = {"Authorization": f"Bearer {auth_token}"}
        token_resp = requests.post(f"{BASE_URL}/jobs/{TEST_JOB_ID}/payment-token", headers=headers)
        if token_resp.status_code == 200:
            return token_resp.json().get("payment_token")
        pytest.skip("Payment token generation failed")
    
    def test_get_payment_details(self, payment_token):
        """GET /api/payment/{token} returns job details with Tranzila config"""
        response = requests.get(f"{BASE_URL}/payment/{payment_token}")
        assert response.status_code == 200, f"Payment details failed: {response.text}"
        data = response.json()
        
        # Check for already_paid status (may have been simulated in previous test)
        if data.get("status") == "already_paid":
            print(f"✓ Payment already completed for job #{data.get('job_number')}")
            return
        
        # Verify required fields
        assert "status" in data, "Response missing status"
        assert "job_number" in data, "Response missing job_number"
        assert "total_fee" in data, "Response missing total_fee"
        assert "stones" in data, "Response missing stones"
        assert "has_tranzila" in data, "Response missing has_tranzila"
        assert "tranzila_terminal" in data, "Response missing tranzila_terminal"
        
        # Verify Tranzila configuration
        assert data["has_tranzila"] == True, "has_tranzila should be True"
        assert data["tranzila_terminal"] == "grsil", f"Expected terminal 'grsil', got '{data['tranzila_terminal']}'"
        
        # Verify stones array
        assert isinstance(data["stones"], list), "stones should be a list"
        
        print(f"✓ Payment details for job #{data['job_number']}")
        print(f"  - Status: {data['status']}")
        print(f"  - Total fee: ${data['total_fee']}")
        print(f"  - Stones: {len(data['stones'])}")
        print(f"  - Tranzila terminal: {data['tranzila_terminal']}")
        print(f"  - Has Tranzila: {data['has_tranzila']}")
    
    def test_invalid_payment_token(self):
        """GET /api/payment/{invalid_token} returns 404"""
        response = requests.get(f"{BASE_URL}/payment/invalid-token-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid payment token correctly returns 404")


class TestPaymentHandshake:
    """Test Tranzila handshake endpoint"""
    
    @pytest.fixture
    def payment_token(self):
        """Get payment token for test job"""
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip("Authentication failed")
        auth_token = login_resp.json().get("access_token")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        token_resp = requests.post(f"{BASE_URL}/jobs/{TEST_JOB_ID}/payment-token", headers=headers)
        if token_resp.status_code == 200:
            return token_resp.json().get("payment_token")
        pytest.skip("Payment token generation failed")
    
    def test_handshake_usd(self, payment_token):
        """POST /api/payment/{token}/handshake with currency=USD returns thtk token"""
        # First check if already paid
        details_resp = requests.get(f"{BASE_URL}/payment/{payment_token}")
        if details_resp.status_code == 200 and details_resp.json().get("status") == "already_paid":
            pytest.skip("Job already paid, cannot test handshake")
        
        response = requests.post(f"{BASE_URL}/payment/{payment_token}/handshake", json={
            "currency": "USD",
            "exchange_rate": 3.65
        })
        
        # May fail if already paid
        if response.status_code == 400 and "already paid" in response.text.lower():
            pytest.skip("Job already paid")
        
        assert response.status_code == 200, f"Handshake failed: {response.text}"
        data = response.json()
        
        assert "thtk" in data, "Response missing thtk token"
        assert "supplier" in data, "Response missing supplier"
        assert "sum" in data, "Response missing sum"
        assert "currency" in data, "Response missing currency"
        assert "currency_code" in data, "Response missing currency_code"
        
        assert data["supplier"] == "grsil", f"Expected supplier 'grsil', got '{data['supplier']}'"
        assert data["currency"] == "USD", f"Expected currency 'USD', got '{data['currency']}'"
        assert data["currency_code"] == "2", f"Expected currency_code '2' for USD, got '{data['currency_code']}'"
        assert isinstance(data["thtk"], str) and len(data["thtk"]) > 0, "thtk should be non-empty string"
        
        print(f"✓ Handshake successful (USD)")
        print(f"  - thtk: {data['thtk'][:20]}...")
        print(f"  - supplier: {data['supplier']}")
        print(f"  - sum: ${data['sum']}")
        print(f"  - currency_code: {data['currency_code']}")
    
    def test_handshake_ils(self, payment_token):
        """POST /api/payment/{token}/handshake with currency=ILS returns converted amount"""
        # First check if already paid
        details_resp = requests.get(f"{BASE_URL}/payment/{payment_token}")
        if details_resp.status_code == 200 and details_resp.json().get("status") == "already_paid":
            pytest.skip("Job already paid, cannot test handshake")
        
        exchange_rate = 3.65
        response = requests.post(f"{BASE_URL}/payment/{payment_token}/handshake", json={
            "currency": "ILS",
            "exchange_rate": exchange_rate
        })
        
        if response.status_code == 400 and "already paid" in response.text.lower():
            pytest.skip("Job already paid")
        
        assert response.status_code == 200, f"Handshake failed: {response.text}"
        data = response.json()
        
        assert data["currency"] == "ILS", f"Expected currency 'ILS', got '{data['currency']}'"
        assert data["currency_code"] == "1", f"Expected currency_code '1' for ILS, got '{data['currency_code']}'"
        
        # Verify amount is converted (should be > USD amount)
        # Get USD amount from payment details
        details = details_resp.json()
        usd_amount = details.get("total_fee", 0)
        expected_ils = round(usd_amount * exchange_rate, 2)
        
        # Allow small rounding difference
        assert abs(data["sum"] - expected_ils) < 0.1, f"ILS amount {data['sum']} doesn't match expected {expected_ils}"
        
        print(f"✓ Handshake successful (ILS)")
        print(f"  - thtk: {data['thtk'][:20]}...")
        print(f"  - sum: ₪{data['sum']} (converted from ${usd_amount})")
        print(f"  - currency_code: {data['currency_code']}")


class TestPaymentStatus:
    """Test payment status endpoint"""
    
    @pytest.fixture
    def payment_token(self):
        """Get payment token for test job"""
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip("Authentication failed")
        auth_token = login_resp.json().get("access_token")
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        token_resp = requests.post(f"{BASE_URL}/jobs/{TEST_JOB_ID}/payment-token", headers=headers)
        if token_resp.status_code == 200:
            return token_resp.json().get("payment_token")
        pytest.skip("Payment token generation failed")
    
    def test_payment_status(self, payment_token):
        """GET /api/payment/{token}/status returns payment status"""
        response = requests.get(f"{BASE_URL}/payment/{payment_token}/status")
        assert response.status_code == 200, f"Status check failed: {response.text}"
        data = response.json()
        
        assert "status" in data, "Response missing status"
        assert "job_number" in data, "Response missing job_number"
        assert data["status"] in ["pending", "paid"], f"Unexpected status: {data['status']}"
        
        print(f"✓ Payment status for job #{data['job_number']}: {data['status']}")
        if data.get("transaction_id"):
            print(f"  - Transaction ID: {data['transaction_id']}")
        if data.get("paid_at"):
            print(f"  - Paid at: {data['paid_at']}")


class TestPaymentSimulation:
    """Test payment simulation (for testing without real payment)"""
    
    @pytest.fixture
    def fresh_payment_token(self):
        """Create a fresh job and get payment token for simulation test"""
        # Login
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code != 200:
            pytest.skip("Authentication failed")
        auth_token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get a client and branch for creating a new job
        clients_resp = requests.get(f"{BASE_URL}/clients", headers=headers)
        if clients_resp.status_code != 200 or not clients_resp.json():
            pytest.skip("No clients available")
        client = clients_resp.json()[0]
        
        branches_resp = requests.get(f"{BASE_URL}/branches", headers=headers)
        if branches_resp.status_code != 200 or not branches_resp.json():
            pytest.skip("No branches available")
        branch = branches_resp.json()[0]
        
        # Create a new job for simulation test
        job_data = {
            "client_id": client["id"],
            "branch_id": branch["id"],
            "service_type": "Grading",
            "certificate_units": [],  # Required field
            "stones": [
                {
                    "sku": f"TEST-SIM-{uuid.uuid4().hex[:6]}",
                    "stone_type": "Diamond",
                    "weight": 1.5,
                    "fee": 100
                }
            ]
        }
        
        job_resp = requests.post(f"{BASE_URL}/jobs", headers=headers, json=job_data)
        if job_resp.status_code not in [200, 201]:
            pytest.skip(f"Job creation failed: {job_resp.text}")
        
        job_id = job_resp.json().get("id")
        
        # Generate payment token for the new job
        token_resp = requests.post(f"{BASE_URL}/jobs/{job_id}/payment-token", headers=headers)
        if token_resp.status_code == 200:
            return token_resp.json().get("payment_token")
        pytest.skip("Payment token generation failed")
    
    def test_simulate_payment_flow(self, fresh_payment_token):
        """Test full simulation flow: status pending -> simulate -> status paid"""
        payment_token = fresh_payment_token
        
        # Step 1: Check initial status is pending
        status_resp = requests.get(f"{BASE_URL}/payment/{payment_token}/status")
        assert status_resp.status_code == 200
        initial_status = status_resp.json()
        assert initial_status["status"] == "pending", f"Expected pending, got {initial_status['status']}"
        print(f"✓ Initial status: pending")
        
        # Step 2: Simulate payment
        simulate_resp = requests.post(f"{BASE_URL}/payment/{payment_token}/simulate")
        assert simulate_resp.status_code == 200, f"Simulation failed: {simulate_resp.text}"
        sim_data = simulate_resp.json()
        assert sim_data["status"] == "paid", f"Expected paid status, got {sim_data['status']}"
        print(f"✓ Payment simulated successfully")
        
        # Step 3: Verify status is now paid
        status_resp2 = requests.get(f"{BASE_URL}/payment/{payment_token}/status")
        assert status_resp2.status_code == 200
        final_status = status_resp2.json()
        assert final_status["status"] == "paid", f"Expected paid, got {final_status['status']}"
        assert final_status.get("transaction_id") is not None, "Transaction ID should be set"
        assert final_status["transaction_id"].startswith("TEST-"), "Simulated transaction should start with TEST-"
        print(f"✓ Final status: paid (txn: {final_status['transaction_id']})")
        
        # Step 4: Verify payment details shows already_paid
        details_resp = requests.get(f"{BASE_URL}/payment/{payment_token}")
        assert details_resp.status_code == 200
        details = details_resp.json()
        assert details["status"] == "already_paid", f"Expected already_paid, got {details['status']}"
        print(f"✓ Payment details shows: already_paid")
        print(f"✓ Full simulation flow completed successfully for job #{final_status['job_number']}")


class TestPaymentEdgeCases:
    """Test edge cases and error handling"""
    
    def test_handshake_invalid_token(self):
        """POST /api/payment/{invalid}/handshake returns 404"""
        response = requests.post(f"{BASE_URL}/payment/invalid-token-xyz/handshake", json={
            "currency": "USD"
        })
        assert response.status_code == 404
        print("✓ Handshake with invalid token returns 404")
    
    def test_simulate_invalid_token(self):
        """POST /api/payment/{invalid}/simulate returns 404"""
        response = requests.post(f"{BASE_URL}/payment/invalid-token-xyz/simulate")
        assert response.status_code == 404
        print("✓ Simulate with invalid token returns 404")
    
    def test_status_invalid_token(self):
        """GET /api/payment/{invalid}/status returns 404"""
        response = requests.get(f"{BASE_URL}/payment/invalid-token-xyz/status")
        assert response.status_code == 404
        print("✓ Status with invalid token returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
