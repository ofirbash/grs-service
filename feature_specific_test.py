#!/usr/bin/env python3
"""
Feature-specific tests for GRS ERP System based on review request
Testing: Client edit, Stone verbal findings, Job grouping/ungrouping
"""

import requests
import sys
import json
from datetime import datetime

class FeatureSpecificTester:
    def __init__(self, base_url="https://lab-logistics-hub-1.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_result(self, test_name: str, success: bool, message: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}: PASSED {message}")
        else:
            self.failed_tests.append(f"{test_name}: {message}")
            print(f"❌ {test_name}: FAILED {message}")
        print("-" * 60)

    def make_request(self, method: str, endpoint: str, data: dict = None) -> tuple[bool, dict, int]:
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {"Content-Type": "application/json"}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            return response.status_code < 400, response_data, response.status_code
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_login(self):
        """Test login with admin credentials"""
        print(f"🔐 Testing Login...")
        
        login_data = {
            "email": "admin@bashari.com",
            "password": "admin123"
        }
        
        success, response, status_code = self.make_request('POST', '/auth/login', login_data)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log_result("Login", True, f"Status: {status_code}")
            return True
        else:
            self.log_result("Login", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_client_update_with_notes(self):
        """Test client update API with notes field"""
        print(f"👤 Testing Client Update with Notes...")
        
        # First get clients
        success, clients, status_code = self.make_request('GET', '/clients')
        if not success or not clients:
            self.log_result("Client Update - Get Clients", False, "Cannot get clients list")
            return False
        
        client_id = clients[0]['id']
        
        # Update client with notes field
        update_data = {
            "name": "Updated Test Client",
            "email": "updated@test.com",
            "phone": "+1-555-0123",
            "company": "Updated Company Inc.",
            "address": "123 Updated St, City, State",
            "notes": "This is a test note field for the client update functionality."
        }
        
        success, response, status_code = self.make_request('PUT', f'/clients/{client_id}', update_data)
        
        if success and 'notes' in response:
            self.log_result("Client Update with Notes", True, f"Status: {status_code}, Notes field present")
            return True
        else:
            self.log_result("Client Update with Notes", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_stone_verbal_findings_structured(self):
        """Test stone verbal findings with structured format and certificate_id validation"""
        print(f"💎 Testing Stone Verbal Findings Structure...")
        
        # Get stones first
        success, stones, status_code = self.make_request('GET', '/stones')
        if not success or not stones:
            self.log_result("Stone Verbal - Get Stones", False, "Cannot get stones list")
            return False
        
        stone_id = stones[0]['id']
        
        # Test structured verbal findings update
        structured_findings = {
            "structured_findings": {
                "certificate_id": "CERT-TEST-12345",
                "weight": 2.5,
                "identification": "NATURAL RUBY",
                "color": "VIVID RED PIGEON BLOOD",
                "origin": "BURMA (MYANMAR)",
                "comment": "HEATED"
            }
        }
        
        success, response, status_code = self.make_request('PUT', f'/stones/{stone_id}/verbal', structured_findings)
        
        if success:
            self.log_result("Stone Verbal Findings Update", True, f"Status: {status_code}")
            
            # Verify the structured format is preserved
            success2, stone_details, status2 = self.make_request('GET', f'/stones/{stone_id}')
            if success2 and isinstance(stone_details.get('verbal_findings'), dict):
                self.log_result("Stone Verbal Findings Structure", True, "Structured format preserved")
                return True
            else:
                self.log_result("Stone Verbal Findings Structure", False, "Structure not preserved")
                return False
        else:
            self.log_result("Stone Verbal Findings Update", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_job_stone_grouping(self):
        """Test job stone grouping and ungrouping functionality"""
        print(f"🔗 Testing Job Stone Grouping...")
        
        # Get jobs first
        success, jobs, status_code = self.make_request('GET', '/jobs')
        if not success or not jobs:
            self.log_result("Job Grouping - Get Jobs", False, "Cannot get jobs list")
            return False
        
        job_id = jobs[0]['id']
        job_stones = jobs[0].get('stones', [])
        
        if len(job_stones) < 2:
            self.log_result("Job Grouping - Insufficient Stones", False, "Need at least 2 stones to test grouping")
            return False
        
        # Select first two stones for grouping
        stone_ids = [job_stones[0]['id'], job_stones[1]['id']]
        
        # Test grouping stones
        group_data = {
            "stone_ids": stone_ids,
            "group_number": 1
        }
        
        success, response, status_code = self.make_request('PUT', f'/jobs/{job_id}/group-stones', group_data)
        
        if success:
            self.log_result("Job Stone Grouping", True, f"Status: {status_code}")
            
            # Test ungrouping stones
            ungroup_data = {
                "stone_ids": stone_ids
            }
            
            success2, response2, status2 = self.make_request('PUT', f'/jobs/{job_id}/ungroup-stones', ungroup_data)
            
            if success2:
                self.log_result("Job Stone Ungrouping", True, f"Status: {status2}")
                return True
            else:
                self.log_result("Job Stone Ungrouping", False, f"Status: {status2}, Response: {response2}")
                return False
        else:
            self.log_result("Job Stone Grouping", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_dropdown_settings_initialization(self):
        """Test dropdown settings initialization for verbal findings"""
        print(f"⚙️ Testing Dropdown Settings Initialization...")
        
        success, response, status_code = self.make_request('POST', '/settings/dropdowns/initialize')
        
        # This might return "already initialized" which is also valid
        if success or status_code == 200:
            # Now check if dropdowns are populated
            success2, dropdowns, status2 = self.make_request('GET', '/settings/dropdowns')
            
            if success2 and dropdowns.get('identification'):
                self.log_result("Dropdown Initialization", True, f"Status: {status_code}, Dropdowns populated")
                return True
            else:
                self.log_result("Dropdown Initialization", False, f"Dropdowns not populated properly")
                return False
        else:
            self.log_result("Dropdown Initialization", False, f"Status: {status_code}, Response: {response}")
            return False

    def run_feature_tests(self):
        """Run all feature-specific tests"""
        print("=" * 70)
        print("🎯 GRS ERP System - Feature-Specific API Tests")
        print("=" * 70)
        
        # 1. Test authentication
        if not self.test_login():
            print("❌ Authentication failed. Cannot proceed with tests.")
            return self.generate_report()
        
        # 2. Test client update with notes
        self.test_client_update_with_notes()
        
        # 3. Test stone verbal findings
        self.test_stone_verbal_findings_structured()
        
        # 4. Test job stone grouping/ungrouping
        self.test_job_stone_grouping()
        
        # 5. Test dropdown settings
        self.test_dropdown_settings_initialization()
        
        return self.generate_report()

    def generate_report(self):
        """Generate final test report"""
        print("\n" + "=" * 70)
        print("📋 FEATURE TEST RESULTS SUMMARY")
        print("=" * 70)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for failure in self.failed_tests:
                print(f"   • {failure}")
        
        print("=" * 70)
        
        return {
            "tests_run": self.tests_run,
            "tests_passed": self.tests_passed,
            "failed_tests": self.failed_tests,
            "success_rate": success_rate
        }

def main():
    """Main test execution function"""
    tester = FeatureSpecificTester()
    result = tester.run_feature_tests()
    
    # Exit with appropriate code
    return 0 if result["success_rate"] >= 80 else 1

if __name__ == "__main__":
    sys.exit(main())