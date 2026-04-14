"""
Test suite for Mounted Fee Feature
Tests:
- PUT /api/stones/{stone_id}/fees with mounted=true adds mounted fee
- PUT /api/stones/{stone_id}/fees with mounted=false removes mounted fee
- Mounted fee only added once per certificate_group
- Color stability test toggle correctly adds/removes fee
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bashari-lab-direct.preview.emergentagent.com/api')
if not BASE_URL.endswith('/api'):
    BASE_URL = BASE_URL.rstrip('/') + '/api'


class TestMountedFeeFeature:
    """Test mounted fee toggle functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/auth/login", json={
            "email": "admin@bashari.com",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        token = login_response.json().get("access_token")
        assert token, "No access token returned"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get a job with stones in certificate group
        jobs_response = self.session.get(f"{BASE_URL}/jobs")
        assert jobs_response.status_code == 200
        jobs = jobs_response.json()
        
        # Find job #18 or any job with stones in certificate groups
        self.test_job = None
        self.test_stone = None
        self.grouped_stones = []
        
        for job in jobs:
            stones = job.get('stones', [])
            grouped = [s for s in stones if s.get('certificate_group') is not None]
            if grouped:
                self.test_job = job
                self.grouped_stones = grouped
                self.test_stone = grouped[0]
                break
        
        if not self.test_stone:
            # Fallback to any stone
            for job in jobs:
                if job.get('stones'):
                    self.test_job = job
                    self.test_stone = job['stones'][0]
                    break
        
        assert self.test_stone, "No test stone found"
        print(f"\nUsing Job #{self.test_job.get('job_number')} with stone {self.test_stone.get('sku')}")
        print(f"Stone ID: {self.test_stone.get('id')}")
        print(f"Certificate Group: {self.test_stone.get('certificate_group')}")
        print(f"Initial mounted: {self.test_stone.get('mounted', False)}")
        print(f"Initial fee: {self.test_stone.get('fee')}")
        
        yield
        
        # Cleanup: Reset stone to unmounted state
        try:
            self.session.put(f"{BASE_URL}/stones/{self.test_stone['id']}/fees", json={"mounted": False})
        except:
            pass
    
    def test_01_mounted_fee_toggle_on(self):
        """Test: Setting mounted=true adds $50 fee"""
        stone_id = self.test_stone['id']
        initial_fee = self.test_stone.get('fee', 0)
        initial_total = self.test_job.get('total_fee', 0)
        initial_mounted = self.test_stone.get('mounted', False)
        
        # First ensure stone is unmounted
        if initial_mounted:
            reset_response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": False})
            assert reset_response.status_code == 200
            # Refresh stone data
            job_response = self.session.get(f"{BASE_URL}/jobs/{self.test_job['id']}")
            job_data = job_response.json()
            stone = next((s for s in job_data.get('stones', []) if s['id'] == stone_id), None)
            initial_fee = stone.get('fee', 0)
            initial_total = job_data.get('total_fee', 0)
        
        # Toggle mounted ON
        response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": True})
        assert response.status_code == 200, f"Failed to set mounted=true: {response.text}"
        
        data = response.json()
        assert "stone" in data, "Response should contain stone data"
        assert "total_fee" in data, "Response should contain total_fee"
        
        updated_stone = data['stone']
        assert updated_stone.get('mounted') == True, "Stone should be marked as mounted"
        
        # Check fee increased by $50 (mounted fee)
        new_fee = updated_stone.get('fee', 0)
        expected_fee = initial_fee + 50
        assert new_fee == expected_fee, f"Stone fee should be {expected_fee}, got {new_fee}"
        
        # Check total_fee increased
        new_total = data.get('total_fee', 0)
        expected_total = initial_total + 50
        assert new_total == expected_total, f"Total fee should be {expected_total}, got {new_total}"
        
        print(f"✓ Mounted ON: Fee {initial_fee} -> {new_fee}, Total {initial_total} -> {new_total}")
    
    def test_02_mounted_fee_toggle_off(self):
        """Test: Setting mounted=false removes $50 fee"""
        stone_id = self.test_stone['id']
        
        # First ensure stone is mounted
        mount_response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": True})
        assert mount_response.status_code == 200
        
        mounted_data = mount_response.json()
        mounted_fee = mounted_data['stone'].get('fee', 0)
        mounted_total = mounted_data.get('total_fee', 0)
        
        # Toggle mounted OFF
        response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": False})
        assert response.status_code == 200, f"Failed to set mounted=false: {response.text}"
        
        data = response.json()
        updated_stone = data['stone']
        assert updated_stone.get('mounted') == False, "Stone should be marked as unmounted"
        
        # Check fee decreased by $50
        new_fee = updated_stone.get('fee', 0)
        expected_fee = mounted_fee - 50
        assert new_fee == expected_fee, f"Stone fee should be {expected_fee}, got {new_fee}"
        
        # Check total_fee decreased
        new_total = data.get('total_fee', 0)
        expected_total = mounted_total - 50
        assert new_total == expected_total, f"Total fee should be {expected_total}, got {new_total}"
        
        print(f"✓ Mounted OFF: Fee {mounted_fee} -> {new_fee}, Total {mounted_total} -> {new_total}")
    
    def test_03_mounted_fee_once_per_certificate_group(self):
        """Test: Mounted fee only added once per certificate group"""
        if len(self.grouped_stones) < 2:
            pytest.skip("Need at least 2 stones in same certificate group")
        
        # Get two stones from same certificate group
        cert_group = self.grouped_stones[0].get('certificate_group')
        same_group_stones = [s for s in self.grouped_stones if s.get('certificate_group') == cert_group]
        
        if len(same_group_stones) < 2:
            pytest.skip("Need at least 2 stones in same certificate group")
        
        stone1 = same_group_stones[0]
        stone2 = same_group_stones[1]
        
        print(f"\nTesting with stones in certificate group {cert_group}:")
        print(f"  Stone 1: {stone1.get('sku')} (ID: {stone1.get('id')})")
        print(f"  Stone 2: {stone2.get('sku')} (ID: {stone2.get('id')})")
        
        # Reset both stones to unmounted
        self.session.put(f"{BASE_URL}/stones/{stone1['id']}/fees", json={"mounted": False})
        self.session.put(f"{BASE_URL}/stones/{stone2['id']}/fees", json={"mounted": False})
        
        # Get fresh job data
        job_response = self.session.get(f"{BASE_URL}/jobs/{self.test_job['id']}")
        job_data = job_response.json()
        initial_total = job_data.get('total_fee', 0)
        
        # Mount first stone - should add $50
        response1 = self.session.put(f"{BASE_URL}/stones/{stone1['id']}/fees", json={"mounted": True})
        assert response1.status_code == 200
        data1 = response1.json()
        total_after_first = data1.get('total_fee', 0)
        
        assert total_after_first == initial_total + 50, f"First mount should add $50: {initial_total} -> {total_after_first}"
        print(f"✓ First stone mounted: Total {initial_total} -> {total_after_first} (+$50)")
        
        # Mount second stone in same group - should NOT add another $50
        response2 = self.session.put(f"{BASE_URL}/stones/{stone2['id']}/fees", json={"mounted": True})
        assert response2.status_code == 200
        data2 = response2.json()
        total_after_second = data2.get('total_fee', 0)
        
        assert total_after_second == total_after_first, f"Second mount in same group should NOT add fee: {total_after_first} -> {total_after_second}"
        print(f"✓ Second stone mounted (same group): Total unchanged at {total_after_second}")
        
        # Cleanup
        self.session.put(f"{BASE_URL}/stones/{stone1['id']}/fees", json={"mounted": False})
        self.session.put(f"{BASE_URL}/stones/{stone2['id']}/fees", json={"mounted": False})
    
    def test_04_color_stability_toggle_on(self):
        """Test: Setting color_stability_test=true adds $50 fee"""
        stone_id = self.test_stone['id']
        
        # Get fresh stone data
        job_response = self.session.get(f"{BASE_URL}/jobs/{self.test_job['id']}")
        job_data = job_response.json()
        stone = next((s for s in job_data.get('stones', []) if s['id'] == stone_id), None)
        
        initial_cst = stone.get('color_stability_test', False)
        initial_fee = stone.get('fee', 0)
        initial_total = job_data.get('total_fee', 0)
        
        # If already has CST, turn it off first
        if initial_cst:
            reset_response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"color_stability_test": False})
            assert reset_response.status_code == 200
            job_response = self.session.get(f"{BASE_URL}/jobs/{self.test_job['id']}")
            job_data = job_response.json()
            stone = next((s for s in job_data.get('stones', []) if s['id'] == stone_id), None)
            initial_fee = stone.get('fee', 0)
            initial_total = job_data.get('total_fee', 0)
        
        # Toggle CST ON
        response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"color_stability_test": True})
        assert response.status_code == 200, f"Failed to set color_stability_test=true: {response.text}"
        
        data = response.json()
        updated_stone = data['stone']
        assert updated_stone.get('color_stability_test') == True, "Stone should have color_stability_test=true"
        
        # Check fee increased by $50
        new_fee = updated_stone.get('fee', 0)
        expected_fee = initial_fee + 50
        assert new_fee == expected_fee, f"Stone fee should be {expected_fee}, got {new_fee}"
        
        print(f"✓ Color Stability ON: Fee {initial_fee} -> {new_fee}")
        
        # Cleanup
        self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"color_stability_test": False})
    
    def test_05_color_stability_toggle_off(self):
        """Test: Setting color_stability_test=false removes $50 fee"""
        stone_id = self.test_stone['id']
        
        # First ensure CST is on
        on_response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"color_stability_test": True})
        assert on_response.status_code == 200
        
        on_data = on_response.json()
        cst_fee = on_data['stone'].get('fee', 0)
        
        # Toggle CST OFF
        response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"color_stability_test": False})
        assert response.status_code == 200, f"Failed to set color_stability_test=false: {response.text}"
        
        data = response.json()
        updated_stone = data['stone']
        assert updated_stone.get('color_stability_test') == False, "Stone should have color_stability_test=false"
        
        # Check fee decreased by $50
        new_fee = updated_stone.get('fee', 0)
        expected_fee = cst_fee - 50
        assert new_fee == expected_fee, f"Stone fee should be {expected_fee}, got {new_fee}"
        
        print(f"✓ Color Stability OFF: Fee {cst_fee} -> {new_fee}")
    
    def test_06_combined_mounted_and_cst(self):
        """Test: Both mounted and color_stability_test can be toggled together"""
        stone_id = self.test_stone['id']
        
        # Reset stone
        self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": False, "color_stability_test": False})
        
        # Get fresh data
        job_response = self.session.get(f"{BASE_URL}/jobs/{self.test_job['id']}")
        job_data = job_response.json()
        stone = next((s for s in job_data.get('stones', []) if s['id'] == stone_id), None)
        initial_fee = stone.get('fee', 0)
        
        # Toggle both ON
        response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={
            "mounted": True,
            "color_stability_test": True
        })
        assert response.status_code == 200
        
        data = response.json()
        updated_stone = data['stone']
        assert updated_stone.get('mounted') == True
        assert updated_stone.get('color_stability_test') == True
        
        # Fee should increase by $100 ($50 mounted + $50 CST)
        new_fee = updated_stone.get('fee', 0)
        expected_fee = initial_fee + 100
        assert new_fee == expected_fee, f"Stone fee should be {expected_fee}, got {new_fee}"
        
        print(f"✓ Both toggles ON: Fee {initial_fee} -> {new_fee} (+$100)")
        
        # Cleanup
        self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": False, "color_stability_test": False})
    
    def test_07_api_returns_updated_total_fee(self):
        """Test: API response includes updated total_fee for frontend"""
        stone_id = self.test_stone['id']
        
        # Reset
        self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": False})
        
        # Toggle mounted
        response = self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": True})
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify response structure
        assert "message" in data, "Response should have message"
        assert "stone" in data, "Response should have stone object"
        assert "total_fee" in data, "Response should have total_fee"
        
        # Verify stone object has mounted field
        assert "mounted" in data['stone'], "Stone should have mounted field"
        assert "fee" in data['stone'], "Stone should have fee field"
        
        print(f"✓ API response structure correct: message, stone, total_fee")
        
        # Cleanup
        self.session.put(f"{BASE_URL}/stones/{stone_id}/fees", json={"mounted": False})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
