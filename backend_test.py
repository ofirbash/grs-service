#!/usr/bin/env python3
"""
GRS Lab Logistics & ERP System - Backend API Testing
Testing all major endpoints with authentication flow
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, List

class GRSAPITester:
    def __init__(self, base_url="https://lab-erp-system.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.user_id = None

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

    def make_request(self, method: str, endpoint: str, data: Dict = None, files: Dict = None) -> tuple[bool, Dict, int]:
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        if not files:  # Only add Content-Type for non-file uploads
            headers['Content-Type'] = 'application/json'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    response = requests.post(url, data=data, files=files, headers={k:v for k,v in headers.items() if k != 'Content-Type'}, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return False, {}, 0

            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            return response.status_code < 400, response_data, response.status_code
        except requests.exceptions.Timeout:
            return False, {"error": "Request timeout"}, 0
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
            self.user_id = response.get('user', {}).get('id')
            self.log_result("Login", True, f"Status: {status_code}, Token acquired")
            return True
        else:
            self.log_result("Login", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        print(f"📊 Testing Dashboard Stats...")
        
        success, response, status_code = self.make_request('GET', '/dashboard/stats')
        
        if success:
            expected_keys = ['total_jobs', 'total_clients', 'total_value', 'total_fee']
            has_all_keys = all(key in response for key in expected_keys)
            
            if has_all_keys:
                self.log_result("Dashboard Stats", True, f"Status: {status_code}, All stats present")
                return True
            else:
                missing = [key for key in expected_keys if key not in response]
                self.log_result("Dashboard Stats", False, f"Missing keys: {missing}")
                return False
        else:
            self.log_result("Dashboard Stats", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_jobs_list(self):
        """Test jobs listing endpoint"""
        print(f"💼 Testing Jobs List...")
        
        success, response, status_code = self.make_request('GET', '/jobs')
        
        if success:
            if isinstance(response, list):
                self.log_result("Jobs List", True, f"Status: {status_code}, Found {len(response)} jobs")
                return True, response
            else:
                self.log_result("Jobs List", False, f"Expected list, got: {type(response)}")
                return False, []
        else:
            self.log_result("Jobs List", False, f"Status: {status_code}, Response: {response}")
            return False, []

    def test_job_details(self, job_id: str):
        """Test job details endpoint"""
        print(f"🔍 Testing Job Details for ID: {job_id}")
        
        success, response, status_code = self.make_request('GET', f'/jobs/{job_id}')
        
        if success:
            expected_keys = ['_id', 'job_number', 'client_name', 'stones']
            has_keys = all(key in response for key in expected_keys)
            
            if has_keys:
                stones_count = len(response.get('stones', []))
                self.log_result("Job Details", True, f"Status: {status_code}, {stones_count} stones")
                return True, response
            else:
                missing = [key for key in expected_keys if key not in response]
                self.log_result("Job Details", False, f"Missing keys: {missing}")
                return False, {}
        else:
            self.log_result("Job Details", False, f"Status: {status_code}, Response: {response}")
            return False, {}

    def test_stones_list(self):
        """Test stones listing endpoint"""
        print(f"💎 Testing Stones List...")
        
        success, response, status_code = self.make_request('GET', '/stones')
        
        if success:
            if isinstance(response, list):
                self.log_result("Stones List", True, f"Status: {status_code}, Found {len(response)} stones")
                return True, response
            else:
                self.log_result("Stones List", False, f"Expected list, got: {type(response)}")
                return False, []
        else:
            self.log_result("Stones List", False, f"Status: {status_code}, Response: {response}")
            return False, []

    def test_clients_list(self):
        """Test clients listing endpoint"""
        print(f"👥 Testing Clients List...")
        
        success, response, status_code = self.make_request('GET', '/clients')
        
        if success:
            if isinstance(response, list):
                self.log_result("Clients List", True, f"Status: {status_code}, Found {len(response)} clients")
                return True, response
            else:
                self.log_result("Clients List", False, f"Expected list, got: {type(response)}")
                return False, []
        else:
            self.log_result("Clients List", False, f"Status: {status_code}, Response: {response}")
            return False, []

    def test_shipments_list(self):
        """Test shipments listing endpoint"""
        print(f"📦 Testing Shipments List...")
        
        success, response, status_code = self.make_request('GET', '/shipments')
        
        if success:
            if isinstance(response, list):
                self.log_result("Shipments List", True, f"Status: {status_code}, Found {len(response)} shipments")
                return True, response
            else:
                self.log_result("Shipments List", False, f"Expected list, got: {type(response)}")
                return False, []
        else:
            self.log_result("Shipments List", False, f"Status: {status_code}, Response: {response}")
            return False, []

    def test_dropdown_settings(self):
        """Test dropdown settings for verbal findings"""
        print(f"⚙️ Testing Dropdown Settings...")
        
        success, response, status_code = self.make_request('GET', '/settings/dropdowns')
        
        if success:
            expected_keys = ['identification', 'color', 'origin', 'comment']
            has_all_keys = all(key in response for key in expected_keys)
            
            if has_all_keys:
                total_options = sum(len(response.get(key, [])) for key in expected_keys)
                self.log_result("Dropdown Settings", True, f"Status: {status_code}, {total_options} total options")
                return True
            else:
                missing = [key for key in expected_keys if key not in response]
                self.log_result("Dropdown Settings", False, f"Missing keys: {missing}")
                return False
        else:
            self.log_result("Dropdown Settings", False, f"Status: {status_code}, Response: {response}")
            return False

    def test_create_shipment(self):
        """Test creating a new shipment"""
        print(f"📦 Testing Create Shipment...")
        
        shipment_data = {
            "tracking_number": f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "client_name": "Test Client",
            "destination": "Test Destination",
            "status": "pending",
            "notes": "Test shipment created by automated test"
        }
        
        success, response, status_code = self.make_request('POST', '/shipments', shipment_data)
        
        if success and '_id' in response:
            shipment_id = response['_id']
            self.log_result("Create Shipment", True, f"Status: {status_code}, ID: {shipment_id}")
            return True, shipment_id
        else:
            self.log_result("Create Shipment", False, f"Status: {status_code}, Response: {response}")
            return False, None

    def run_all_tests(self):
        """Run comprehensive API tests"""
        print("=" * 70)
        print("🧪 GRS Lab Logistics & ERP System - Backend API Tests")
        print("=" * 70)
        
        # 1. Test authentication
        if not self.test_login():
            print("❌ Authentication failed. Cannot proceed with authenticated tests.")
            return self.generate_report()
        
        # 2. Test dashboard stats
        self.test_dashboard_stats()
        
        # 3. Test main listing endpoints
        jobs_success, jobs = self.test_jobs_list()
        stones_success, stones = self.test_stones_list()
        clients_success, clients = self.test_clients_list()
        shipments_success, shipments = self.test_shipments_list()
        
        # 4. Test job details if jobs exist
        if jobs_success and jobs:
            first_job_id = jobs[0].get('_id')
            if first_job_id:
                self.test_job_details(first_job_id)
        
        # 5. Test dropdown settings for verbal findings
        self.test_dropdown_settings()
        
        # 6. Test create operations
        self.test_create_shipment()
        
        return self.generate_report()

    def generate_report(self):
        """Generate final test report"""
        print("\n" + "=" * 70)
        print("📋 TEST RESULTS SUMMARY")
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
    tester = GRSAPITester()
    result = tester.run_all_tests()
    
    # Exit with appropriate code
    return 0 if result["success_rate"] >= 80 else 1

if __name__ == "__main__":
    sys.exit(main())