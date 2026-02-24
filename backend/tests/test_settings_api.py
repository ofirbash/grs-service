"""
Test suite for Admin Settings API endpoints:
- Dropdown Settings (GET/PUT /api/settings/dropdowns)
- Branches CRUD (GET/POST/PUT /api/branches)
- Pricing Configuration (GET/PUT /api/pricing)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('NEXT_PUBLIC_API_URL', 'https://erp-stone-system.preview.emergentagent.com/api')

# Test credentials
ADMIN_EMAIL = "admin@bashari.com"
ADMIN_PASSWORD = "admin123"


class TestAuth:
    """Helper class for authentication"""
    
    @staticmethod
    def get_admin_token():
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in login response"
        return data["access_token"]


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    return TestAuth.get_admin_token()


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Create headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestDropdownSettings:
    """Test dropdown settings endpoints"""
    
    def test_get_dropdowns(self, auth_headers):
        """GET /api/settings/dropdowns - Retrieve all dropdown settings"""
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get dropdowns: {response.text}"
        
        data = response.json()
        # Verify structure has all required fields
        assert "identification" in data, "Missing identification field"
        assert "color" in data, "Missing color field"
        assert "origin" in data, "Missing origin field"
        assert "comment" in data, "Missing comment field"
        
        # Each should be a list
        assert isinstance(data["identification"], list), "identification should be a list"
        assert isinstance(data["color"], list), "color should be a list"
        assert isinstance(data["origin"], list), "origin should be a list"
        assert isinstance(data["comment"], list), "comment should be a list"
        
        print(f"✓ Dropdowns retrieved - identification: {len(data['identification'])}, color: {len(data['color'])}, origin: {len(data['origin'])}, comment: {len(data['comment'])}")
    
    def test_update_dropdown_identification(self, auth_headers):
        """PUT /api/settings/dropdowns/identification - Update identification options"""
        # First get current values
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        original_data = response.json()
        
        # Add a test option
        test_option = {"value": "TEST_IDENTIFICATION", "stone_types": ["all"]}
        updated_options = original_data["identification"] + [test_option]
        
        # Update
        response = requests.put(
            f"{BASE_URL}/settings/dropdowns/identification",
            json=updated_options,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update identification: {response.text}"
        
        # Verify update persisted
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        data = response.json()
        values = [opt["value"] for opt in data["identification"]]
        assert "TEST_IDENTIFICATION" in values, "Test option not found after update"
        
        # Cleanup - remove test option
        cleaned_options = [opt for opt in data["identification"] if opt["value"] != "TEST_IDENTIFICATION"]
        requests.put(
            f"{BASE_URL}/settings/dropdowns/identification",
            json=cleaned_options,
            headers=auth_headers
        )
        
        print("✓ Dropdown identification update works correctly")
    
    def test_update_dropdown_with_stone_type_filter(self, auth_headers):
        """PUT /api/settings/dropdowns - Update with specific stone type filters"""
        # First get current values
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        original_data = response.json()
        
        # Add option with specific stone types
        test_option = {"value": "TEST_RUBY_ONLY", "stone_types": ["Ruby"]}
        updated_options = original_data["identification"] + [test_option]
        
        response = requests.put(
            f"{BASE_URL}/settings/dropdowns/identification",
            json=updated_options,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Verify stone_types preserved
        response = requests.get(f"{BASE_URL}/settings/dropdowns", headers=auth_headers)
        data = response.json()
        test_opt = next((opt for opt in data["identification"] if opt["value"] == "TEST_RUBY_ONLY"), None)
        assert test_opt is not None, "Test option not found"
        assert test_opt["stone_types"] == ["Ruby"], f"Stone types not preserved: {test_opt['stone_types']}"
        
        # Cleanup
        cleaned_options = [opt for opt in data["identification"] if opt["value"] != "TEST_RUBY_ONLY"]
        requests.put(
            f"{BASE_URL}/settings/dropdowns/identification",
            json=cleaned_options,
            headers=auth_headers
        )
        
        print("✓ Dropdown stone type filter works correctly")


class TestBranches:
    """Test branches CRUD endpoints"""
    
    def test_get_branches(self, auth_headers):
        """GET /api/branches - Retrieve all branches"""
        response = requests.get(f"{BASE_URL}/branches", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get branches: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Branches should be a list"
        
        # Should have existing branches (Israel, USA as mentioned in requirements)
        print(f"✓ Retrieved {len(data)} branches")
        
        for branch in data:
            assert "id" in branch, "Branch missing id"
            assert "name" in branch, "Branch missing name"
            assert "code" in branch, "Branch missing code"
            assert "address" in branch, "Branch missing address"
            assert "return_address" in branch, "Branch missing return_address"
            print(f"  - Branch: {branch['name']} ({branch['code']})")
    
    def test_create_branch(self, auth_headers):
        """POST /api/branches - Create a new branch"""
        test_branch = {
            "name": "TEST_Branch_Settings",
            "code": "TST",
            "address": "123 Test Street, Test City",
            "return_address": "456 Return Ave, Test City",
            "phone": "+1-555-TEST",
            "email": "test@testbranch.com"
        }
        
        response = requests.post(f"{BASE_URL}/branches", json=test_branch, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create branch: {response.text}"
        
        data = response.json()
        assert data["name"] == test_branch["name"], "Branch name mismatch"
        assert data["code"] == test_branch["code"], "Branch code mismatch"
        assert data["address"] == test_branch["address"], "Branch address mismatch"
        assert data["return_address"] == test_branch["return_address"], "Branch return_address mismatch"
        assert "id" in data, "Created branch missing id"
        
        # Store for cleanup
        created_id = data["id"]
        
        print(f"✓ Branch created successfully with ID: {created_id}")
        
        # Verify it appears in list
        response = requests.get(f"{BASE_URL}/branches", headers=auth_headers)
        branches = response.json()
        found = any(b["id"] == created_id for b in branches)
        assert found, "Created branch not found in list"
        
        return created_id
    
    def test_update_branch(self, auth_headers):
        """PUT /api/branches/{id} - Update a branch"""
        # First create a branch to update
        test_branch = {
            "name": "TEST_Branch_Update",
            "code": "TBU",
            "address": "Original Address",
            "return_address": "Original Return",
            "phone": "+1-111-1111",
            "email": "original@test.com"
        }
        
        create_response = requests.post(f"{BASE_URL}/branches", json=test_branch, headers=auth_headers)
        assert create_response.status_code == 200
        branch_id = create_response.json()["id"]
        
        # Update the branch
        updated_branch = {
            "name": "TEST_Branch_Updated",
            "code": "TBU",
            "address": "Updated Address",
            "return_address": "Updated Return Address",
            "phone": "+1-222-2222",
            "email": "updated@test.com"
        }
        
        response = requests.put(f"{BASE_URL}/branches/{branch_id}", json=updated_branch, headers=auth_headers)
        assert response.status_code == 200, f"Failed to update branch: {response.text}"
        
        data = response.json()
        assert data["name"] == updated_branch["name"], "Name not updated"
        assert data["address"] == updated_branch["address"], "Address not updated"
        
        # Verify update persisted
        response = requests.get(f"{BASE_URL}/branches/{branch_id}", headers=auth_headers)
        assert response.status_code == 200
        branch = response.json()
        assert branch["address"] == "Updated Address", "Update not persisted"
        
        print(f"✓ Branch updated successfully")
    
    def test_get_single_branch(self, auth_headers):
        """GET /api/branches/{id} - Get a specific branch"""
        # First get list
        response = requests.get(f"{BASE_URL}/branches", headers=auth_headers)
        branches = response.json()
        
        if branches:
            branch_id = branches[0]["id"]
            response = requests.get(f"{BASE_URL}/branches/{branch_id}", headers=auth_headers)
            assert response.status_code == 200, f"Failed to get branch: {response.text}"
            
            data = response.json()
            assert data["id"] == branch_id, "Branch ID mismatch"
            print(f"✓ Retrieved single branch: {data['name']}")
        else:
            pytest.skip("No branches to test")


class TestPricing:
    """Test pricing configuration endpoints"""
    
    def test_get_pricing(self, auth_headers):
        """GET /api/pricing - Retrieve pricing configuration"""
        response = requests.get(f"{BASE_URL}/pricing", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get pricing: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "brackets" in data, "Missing brackets field"
        assert "color_stability_fee" in data, "Missing color_stability_fee field"
        assert "service_types" in data, "Missing service_types field"
        
        assert isinstance(data["brackets"], list), "brackets should be a list"
        assert isinstance(data["color_stability_fee"], (int, float)), "color_stability_fee should be numeric"
        assert isinstance(data["service_types"], list), "service_types should be a list"
        
        # Verify bracket structure
        for bracket in data["brackets"]:
            assert "min_value" in bracket, "Bracket missing min_value"
            assert "max_value" in bracket, "Bracket missing max_value"
            assert "express_fee" in bracket, "Bracket missing express_fee"
            assert "normal_fee" in bracket, "Bracket missing normal_fee"
            assert "recheck_fee" in bracket, "Bracket missing recheck_fee"
        
        print(f"✓ Pricing retrieved - {len(data['brackets'])} brackets, color_stability_fee: ${data['color_stability_fee']}")
        print(f"  Service types: {data['service_types']}")
    
    def test_update_pricing(self, auth_headers):
        """PUT /api/pricing - Update pricing configuration"""
        # First get current pricing
        response = requests.get(f"{BASE_URL}/pricing", headers=auth_headers)
        original_pricing = response.json()
        
        # Update color_stability_fee
        updated_pricing = {
            "brackets": original_pricing["brackets"],
            "color_stability_fee": 75,  # Changed from default
            "service_types": original_pricing["service_types"]
        }
        
        response = requests.put(f"{BASE_URL}/pricing", json=updated_pricing, headers=auth_headers)
        assert response.status_code == 200, f"Failed to update pricing: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/pricing", headers=auth_headers)
        data = response.json()
        assert data["color_stability_fee"] == 75, f"Color stability fee not updated: {data['color_stability_fee']}"
        
        # Restore original
        response = requests.put(f"{BASE_URL}/pricing", json=original_pricing, headers=auth_headers)
        assert response.status_code == 200
        
        print("✓ Pricing update works correctly")
    
    def test_update_pricing_brackets(self, auth_headers):
        """PUT /api/pricing - Update pricing brackets"""
        # Get current pricing
        response = requests.get(f"{BASE_URL}/pricing", headers=auth_headers)
        original_pricing = response.json()
        
        # Add a new bracket
        new_bracket = {
            "min_value": 9999999,
            "max_value": 99999999,
            "express_fee": 1000,
            "normal_fee": 800,
            "recheck_fee": 400
        }
        
        updated_pricing = {
            "brackets": original_pricing["brackets"] + [new_bracket],
            "color_stability_fee": original_pricing["color_stability_fee"],
            "service_types": original_pricing["service_types"]
        }
        
        response = requests.put(f"{BASE_URL}/pricing", json=updated_pricing, headers=auth_headers)
        assert response.status_code == 200
        
        # Verify
        response = requests.get(f"{BASE_URL}/pricing", headers=auth_headers)
        data = response.json()
        assert len(data["brackets"]) == len(original_pricing["brackets"]) + 1, "Bracket not added"
        
        # Restore original
        requests.put(f"{BASE_URL}/pricing", json=original_pricing, headers=auth_headers)
        
        print("✓ Pricing brackets update works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
