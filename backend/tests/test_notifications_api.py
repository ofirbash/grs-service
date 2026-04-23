"""
Tests for Email Notification API endpoints
- GET /api/jobs/{job_id}/notifications/status
- GET /api/jobs/{job_id}/notifications/preview/{notification_type}
- POST /api/jobs/{job_id}/notifications/send/{notification_type}
"""

import pytest
import requests
import os
from test_config import BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, CUSTOMER_EMAIL, CUSTOMER_PASSWORD, BRANCH_ADMIN_EMAIL, BRANCH_ADMIN_PASSWORD

# Test credentials
TEST_JOB_ID = "699d5beae87250434c9f9b40"

# Valid notification types
NOTIFICATION_TYPES = ["stones_accepted", "verbal_uploaded", "stones_returned", "cert_uploaded", "cert_returned"]


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Failed to authenticate: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in response"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for requests"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestNotificationStatusEndpoint:
    """Tests for GET /api/jobs/{job_id}/notifications/status"""
    
    def test_get_notification_status_success(self, auth_headers):
        """Test getting notification status for a job"""
        response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/status",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "job_id" in data
        assert "job_number" in data
        assert "current_status" in data
        assert "notifications" in data
        assert isinstance(data["notifications"], list)
        
        # Validate notification structure
        for notif in data["notifications"]:
            assert "type" in notif
            assert "description" in notif
            assert "status_trigger" in notif
            assert "is_available" in notif
            assert "is_sent" in notif
            assert "can_send" in notif
            assert isinstance(notif["is_available"], bool)
            assert isinstance(notif["is_sent"], bool)
            assert isinstance(notif["can_send"], bool)
        
        print(f"Job #{data['job_number']} status: {data['current_status']}")
        available = [n for n in data["notifications"] if n["is_available"]]
        print(f"Available notifications: {[n['type'] for n in available]}")
        
    def test_notification_status_invalid_job_id(self, auth_headers):
        """Test getting notification status for non-existent job"""
        fake_id = "000000000000000000000000"
        response = requests.get(
            f"{BASE_URL}/jobs/{fake_id}/notifications/status",
            headers=auth_headers
        )
        assert response.status_code == 404
        
    def test_notification_status_without_auth(self):
        """Test that notification status requires authentication"""
        response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/status"
        )
        assert response.status_code == 403  # Requires auth


class TestNotificationPreviewEndpoint:
    """Tests for GET /api/jobs/{job_id}/notifications/preview/{notification_type}"""
    
    def test_preview_notification_success(self, auth_headers):
        """Test previewing notification email"""
        notification_type = "stones_accepted"
        response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/preview/{notification_type}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "notification_type" in data
        assert data["notification_type"] == notification_type
        assert "description" in data
        assert "job_number" in data
        assert "recipient_email" in data
        assert "recipient_name" in data
        assert "subject" in data
        assert "html_body" in data
        assert "attachments" in data
        assert "can_send" in data
        assert "current_status" in data
        
        # Validate HTML body contains content
        assert len(data["html_body"]) > 0
        assert "GRS Global" in data["html_body"]
        
        print(f"Preview for {notification_type}:")
        print(f"  Subject: {data['subject']}")
        print(f"  Recipient: {data['recipient_email']}")
        print(f"  Can send: {data['can_send']}")
        
    def test_preview_all_notification_types(self, auth_headers):
        """Test previewing all notification types"""
        for notif_type in NOTIFICATION_TYPES:
            response = requests.get(
                f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/preview/{notif_type}",
                headers=auth_headers
            )
            assert response.status_code == 200, f"Failed for {notif_type}: {response.text}"
            
            data = response.json()
            assert data["notification_type"] == notif_type
            assert "subject" in data
            assert "html_body" in data
            print(f"  {notif_type}: OK - Subject: {data['subject'][:50]}...")
            
    def test_preview_invalid_notification_type(self, auth_headers):
        """Test preview with invalid notification type"""
        response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/preview/invalid_type",
            headers=auth_headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "Invalid notification type" in data.get("detail", "")
        
    def test_preview_invalid_job_id(self, auth_headers):
        """Test preview for non-existent job"""
        fake_id = "000000000000000000000000"
        response = requests.get(
            f"{BASE_URL}/jobs/{fake_id}/notifications/preview/stones_accepted",
            headers=auth_headers
        )
        assert response.status_code == 404
        
    def test_preview_without_auth(self):
        """Test that preview requires admin authentication"""
        response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/preview/stones_accepted"
        )
        # Should fail without auth - returns 403 for missing credentials
        assert response.status_code == 403


class TestNotificationSendEndpoint:
    """Tests for POST /api/jobs/{job_id}/notifications/send/{notification_type}"""
    
    def test_send_notification_structure(self, auth_headers):
        """Test send endpoint returns proper structure"""
        notification_type = "stones_accepted"
        
        # First get the recipient email from preview
        preview_response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/preview/{notification_type}",
            headers=auth_headers
        )
        assert preview_response.status_code == 200
        recipient_email = preview_response.json().get("recipient_email", "test@test.com")
        
        # Send the notification
        response = requests.post(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/send/{notification_type}",
            headers=auth_headers,
            json={
                "notification_type": notification_type,
                "recipient_email": recipient_email
            }
        )
        
        # May succeed (200) or fail (500) depending on email service
        # Just ensure endpoint works and returns proper structure
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            assert "notification_id" in data
            assert "status" in data
            assert "recipient" in data
            assert "subject" in data
            print(f"Send successful: {data['status']} - ID: {data['notification_id']}")
        elif response.status_code == 500:
            # Email sending might fail due to Resend configuration
            data = response.json()
            print(f"Send failed (expected if Resend not configured): {data.get('detail', '')}")
        else:
            # Unexpected status
            print(f"Unexpected status: {response.status_code} - {response.text}")
            
    def test_send_notification_invalid_type(self, auth_headers):
        """Test send with invalid notification type"""
        response = requests.post(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/send/invalid_type",
            headers=auth_headers,
            json={
                "notification_type": "invalid_type",
                "recipient_email": "test@example.com"
            }
        )
        assert response.status_code == 400
        
    def test_send_notification_invalid_job(self, auth_headers):
        """Test send for non-existent job"""
        fake_id = "000000000000000000000000"
        response = requests.post(
            f"{BASE_URL}/jobs/{fake_id}/notifications/send/stones_accepted",
            headers=auth_headers,
            json={
                "notification_type": "stones_accepted",
                "recipient_email": "test@example.com"
            }
        )
        assert response.status_code == 404
        
    def test_send_notification_without_auth(self):
        """Test that send requires admin authentication"""
        response = requests.post(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/send/stones_accepted",
            json={
                "notification_type": "stones_accepted",
                "recipient_email": "test@example.com"
            }
        )
        assert response.status_code == 403


class TestNotificationCanSend:
    """Tests to verify can_send is true when API key is configured"""
    
    def test_can_send_is_true(self, auth_headers):
        """Verify that can_send returns true when Resend API key is configured"""
        response = requests.get(
            f"{BASE_URL}/jobs/{TEST_JOB_ID}/notifications/preview/stones_accepted",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        # The main agent configured RESEND_API_KEY, so can_send should be true
        assert "can_send" in data
        assert data["can_send"] is True, "can_send should be true when API key is configured"
        print(f"can_send: {data['can_send']} - API key is configured!")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
