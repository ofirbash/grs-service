"""Test the partial-return feature: shipment with stone_ids should only
update the status of selected stones. Uses asyncio.run to avoid needing
pytest-asyncio (not installed in this environment).
"""
import asyncio
from unittest.mock import AsyncMock, patch

from routes.shipments import _apply_stone_lifecycle, _is_partial_shipment


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if asyncio.get_event_loop().is_running() is False else asyncio.run(coro)


def _run_safe(coro):
    """Create a fresh event loop each time to avoid bleed-over."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestPartialShipmentHelpers:

    def test_is_partial_with_stone_ids(self):
        assert _is_partial_shipment({"stone_ids": ["a", "b"]}) is True

    def test_is_partial_without_stone_ids(self):
        assert _is_partial_shipment({"stone_ids": []}) is False
        assert _is_partial_shipment({}) is False

    def test_is_partial_with_none(self):
        assert _is_partial_shipment({"stone_ids": None}) is False


def _make_mock_db(job_doc, update_calls):
    """Return a patched db object whose jobs collection returns job_doc."""
    async def mock_find_one(_query):
        return job_doc

    async def mock_update_one(_query, update):
        update_calls.append(update)
        return AsyncMock()

    mock_db = AsyncMock()
    mock_db.jobs.find_one = mock_find_one
    mock_db.jobs.update_one = mock_update_one
    return mock_db


class TestApplyStoneLifecycle:

    def test_stones_from_lab_delivered_updates_only_selected_stones(self):
        job_doc = {
            "_id": "job1",
            "stones": [
                {"id": "s1", "sku": "A", "stone_status": "at_lab", "cert_status": "pending"},
                {"id": "s2", "sku": "B", "stone_status": "at_lab", "cert_status": "pending"},
                {"id": "s3", "sku": "C", "stone_status": "at_lab", "cert_status": "pending"},
            ],
        }
        shipment = {
            "shipment_type": "stones_from_lab",
            "job_ids": ["job1"],
            "stone_ids": ["s1", "s2"],
        }
        update_calls = []
        mock_db = _make_mock_db(job_doc, update_calls)

        with patch("routes.shipments.db", mock_db), \
             patch("routes.shipments.ObjectId", lambda x: x):
            modified = _run_safe(_apply_stone_lifecycle(shipment, "delivered"))

        assert modified == 2
        new_stones = update_calls[0]["$set"]["stones"]
        assert new_stones[0]["stone_status"] == "returned"
        assert new_stones[1]["stone_status"] == "returned"
        assert new_stones[2]["stone_status"] == "at_lab"

    def test_legacy_stones_are_skipped(self):
        job_doc = {
            "_id": "job1",
            "stones": [
                {"id": "s1", "sku": "A"},
                {"id": "s2", "sku": "B", "stone_status": "at_lab"},
            ],
        }
        shipment = {
            "shipment_type": "stones_from_lab",
            "job_ids": ["job1"],
            "stone_ids": [],
        }
        update_calls = []
        mock_db = _make_mock_db(job_doc, update_calls)

        with patch("routes.shipments.db", mock_db), \
             patch("routes.shipments.ObjectId", lambda x: x):
            modified = _run_safe(_apply_stone_lifecycle(shipment, "delivered"))

        assert modified == 1
        new_stones = update_calls[0]["$set"]["stones"]
        assert "stone_status" not in new_stones[0]
        assert new_stones[1]["stone_status"] == "returned"

    def test_certificates_from_lab_updates_cert_status(self):
        job_doc = {
            "_id": "job1",
            "stones": [
                {"id": "s1", "cert_status": "pending"},
                {"id": "s2", "cert_status": "pending"},
            ],
        }
        shipment = {
            "shipment_type": "certificates_from_lab",
            "job_ids": ["job1"],
            "stone_ids": ["s1"],
        }
        update_calls = []
        mock_db = _make_mock_db(job_doc, update_calls)

        with patch("routes.shipments.db", mock_db), \
             patch("routes.shipments.ObjectId", lambda x: x):
            modified = _run_safe(_apply_stone_lifecycle(shipment, "delivered"))

        assert modified == 1
        new_stones = update_calls[0]["$set"]["stones"]
        assert new_stones[0]["cert_status"] == "delivered"
        assert new_stones[1]["cert_status"] == "pending"

    def test_no_op_for_irrelevant_status(self):
        shipment = {
            "shipment_type": "stones_from_lab",
            "job_ids": ["job1"],
            "stone_ids": ["s1"],
        }
        with patch("routes.shipments.db", AsyncMock()):
            modified = _run_safe(_apply_stone_lifecycle(shipment, "cancelled"))
        assert modified == 0


class TestEmailPartialEnumeration:
    """Verify the email partitions stones into returned / pending sets."""

    def test_stones_returned_partial(self):
        from email_templates import build_notification_email_html
        job = {
            "job_number": 77,
            "stones": [
                {"id": "a", "sku": "SA200", "stone_type": "Sapphire", "weight": 2.5, "value": 5000, "fee": 100, "stone_status": "returned"},
                {"id": "b", "sku": "RU100", "stone_type": "Ruby", "weight": 1.5, "value": 3000, "fee": 80, "stone_status": "at_lab"},
            ],
        }
        client = {"name": "Test", "email": "t@t.com"}
        subject, body = build_notification_email_html("stones_returned", job, client)
        assert "Partial return" in subject
        assert "1 of 2" in subject
        assert "Returned in this shipment" in body
        assert "Still at the lab" in body
        assert "SA200" in body
        assert "RU100" in body

    def test_stones_returned_full_backward_compat(self):
        """When no stone has stone_status (legacy job), use old wording."""
        from email_templates import build_notification_email_html
        job = {
            "job_number": 5,
            "stones": [
                {"id": "a", "sku": "SA1", "stone_type": "Sapphire", "weight": 2.0, "value": 2000, "fee": 60},
            ],
        }
        client = {"name": "Test", "email": "t@t.com"}
        subject, body = build_notification_email_html("stones_returned", job, client)
        assert "Partial" not in subject
        assert "Still at the lab" not in body

    def test_cert_returned_partial(self):
        from email_templates import build_notification_email_html
        job = {
            "job_number": 12,
            "stones": [
                {"id": "a", "sku": "SA200", "stone_type": "Sapphire", "weight": 2.5, "value": 5000, "fee": 100, "cert_status": "delivered"},
                {"id": "b", "sku": "RU100", "stone_type": "Ruby", "weight": 1.5, "value": 3000, "fee": 80, "cert_status": "pending"},
            ],
        }
        client = {"name": "Test", "email": "t@t.com"}
        subject, body = build_notification_email_html("cert_returned", job, client)
        assert "Partial" in subject
        assert "Certificates still pending" in body
