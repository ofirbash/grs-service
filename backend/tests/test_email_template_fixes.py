"""Regression for the email-rendering fixes shipped Feb 25 2026 after
admin feedback on job #512:

  1. Subject no longer says "at the lab" — just "Stones received".
  2. Meta pill shows BOTH physical stone count + certificate count, so a
     10-stone parcel reads "10 stones · 1 certificate" instead of "1".
  3. Stones-accepted email no longer claims a signed Memo-In is attached
     (we don't actually attach one — was misleading).
  4. Footer email contact swapped to lab@bashari.co (was grs-il@bashds.com).
  5. Footer "automated message, do not reply" line replaced with a friendly
     "reply directly to this email" prompt.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from email_templates import (  # noqa: E402
    COMPANY_EMAIL,
    _footer_html,
    _job_meta_pill,
    _render_stones_accepted,
)


def _ctx(stones, *, job_number=512):
    """Build a render context shaped like the notifications route hands in."""
    job = {
        "job_number": job_number,
        "service_type": "Standard",
        "stones": stones,
    }
    return {
        "job": job,
        "job_number": job_number,
        "stones": stones,
        "portal_link": "https://lab.bashari.co/dashboard/jobs",
        "greeting": "<p>Hello,</p>",
    }


# ---- (1) Subject ----------------------------------------------------------


def test_subject_no_longer_says_at_the_lab():
    subject, _ = _render_stones_accepted(_ctx([_single_stone()]))
    assert subject == "Job #512 · Stones received"
    assert "at the lab" not in subject


# ---- (2) Pill physical-vs-certificate counts ------------------------------


def _single_stone(**overrides):
    base = {
        "sku": "RU100J51201",
        "stone_type": "Ruby",
        "weight": 1.5,
        "value": 1000,
        "fee": 250,
    }
    base.update(overrides)
    return base


def _parcel_stone(stone_count, **overrides):
    base = _single_stone(**overrides)
    base.update({"kind": "parcel", "stone_count": stone_count})
    return base


def test_pill_one_singleton_stone():
    html = _job_meta_pill({"job_number": 1, "stones": [_single_stone()]})
    # singular labels for the "1 stone · 1 certificate" case
    assert "1 stone " in html
    assert "1 certificate" in html
    assert "1 stones" not in html  # no plural-with-1


def test_pill_three_singletons():
    html = _job_meta_pill({
        "job_number": 2,
        "stones": [_single_stone(), _single_stone(), _single_stone()],
    })
    assert "3 stones" in html
    assert "3 certificates" in html


def test_pill_one_parcel_of_ten():
    """The exact job #512 scenario — one parcel row covering 10 stones."""
    html = _job_meta_pill({"job_number": 512, "stones": [_parcel_stone(10)]})
    assert "10 stones" in html, "physical stone count should expand to 10"
    assert "1 certificate" in html
    assert "1 stones" not in html  # would mean we forgot to expand the parcel


def test_pill_mixed_parcel_and_singletons():
    html = _job_meta_pill({
        "job_number": 3,
        "stones": [_parcel_stone(7), _single_stone(), _single_stone()],
    })
    assert "9 stones" in html  # 7 + 1 + 1
    assert "3 certificates" in html


def test_pill_ignores_cancelled_stones():
    html = _job_meta_pill({
        "job_number": 4,
        "stones": [
            _single_stone(),
            _single_stone(cancelled=True),
            _parcel_stone(5, cancelled=True),
        ],
    })
    assert "1 stone " in html
    assert "1 certificate" in html


# ---- (3) Stones-accepted body no longer mentions a signed Memo-In ---------


def test_stones_accepted_body_no_longer_promises_a_memo_attachment():
    _, body = _render_stones_accepted(_ctx([_single_stone()]))
    assert "Memo-In" not in body
    assert "signed Memo-In document is attached" not in body


# ---- (4) + (5) Footer changes --------------------------------------------


def test_footer_uses_new_lab_bashari_co_email():
    html = _footer_html()
    assert COMPANY_EMAIL == "lab@bashari.co"
    assert "lab@bashari.co" in html
    assert "grs-il@bashds.com" not in html


def test_footer_friendly_reply_line_replaces_automated_message():
    html = _footer_html()
    assert "automated message" not in html.lower()
    assert "do not reply" not in html.lower()
    assert "reply directly to this email" in html
