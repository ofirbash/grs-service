"""Email HTML template builders for notification system.

All templates use a consistent, branded wrapper so clients receive a polished
Bashari Lab-Direct experience across every touchpoint.
"""

import os

# ---------------------------------------------------------------------------
# Brand / company constants (kept in one place so the display remains
# consistent across Print, Email and SMS templates).
# ---------------------------------------------------------------------------

BRAND_NAVY = "#141417"
BRAND_NAVY_DARK = "#09090b"
BRAND_RED = "#E30613"
BRAND_ACCENT = "#c2410c"  # warm accent used for "due" highlights
TEXT_BODY = "#3f3f46"
TEXT_MUTED = "#71717a"
BG_SOFT = "#f5f5f5"
BORDER_SOFT = "#e5e5e5"

COMPANY_DISPLAY_NAME = "Bashari Lab-Direct"
COMPANY_LEGAL_NAME = "Eliyahu Bashari Diamonds LTD"
COMPANY_ADDRESS = (
    "Israel Diamond Exchange, Macabbi bld. 23-42, 1 Jabotinsky st. 5252001, Ramat-Gan"
)
COMPANY_PHONES = ["+972-3-7521295", "+972-54-2989805"]
COMPANY_EMAIL = "grs-il@bashds.com"
COMPANY_VAT = "513180083"
LOGO_URL = "https://customer-assets.emergentagent.com/job_777624e9-9d3b-43c3-b65b-05602d9f9f7d/artifacts/cpw6x0ub_bashari%20logo-square%20copy.jpg"

# Portal URL resolved from env when available so CTA links point to the live app
PORTAL_URL = os.getenv("PORTAL_URL", "https://bashari-lab-direct.preview.emergentagent.com")


# ---------------------------------------------------------------------------
# Shared building blocks
# ---------------------------------------------------------------------------

def _header_html() -> str:
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: {BRAND_NAVY};">
      <tr>
        <td style="padding: 22px 28px;" valign="middle">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="text-align: left; width: 60px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="background: #ffffff; border-radius: 8px; padding: 4px; line-height: 0;">
                    <img src="{LOGO_URL}" alt="{COMPANY_DISPLAY_NAME}" width="40" height="40" style="display: block; width: 40px; height: 40px; object-fit: contain;" />
                  </td>
                </tr></table>
              </td>
              <td valign="middle" style="text-align: right; color: #d4d4d8; font-family: Arial, sans-serif; font-size: 12px;">
                <div style="color: #ffffff; font-weight: 700; font-size: 14px;">{COMPANY_DISPLAY_NAME}</div>
                <div style="color: #a1a1aa; font-size: 11px; margin-top: 2px;">Gemstone Lab &amp; Certification</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    """


def _footer_html() -> str:
    phones = " &nbsp;·&nbsp; ".join(COMPANY_PHONES)
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: {BG_SOFT}; border-top: 1px solid #d9e2ec;">
      <tr>
        <td style="padding: 20px 28px; font-family: Arial, sans-serif; font-size: 11px; color: {TEXT_MUTED}; line-height: 1.6; text-align: center;">
          <div style="color: {TEXT_BODY}; font-weight: 700; font-size: 12px;">{COMPANY_LEGAL_NAME}</div>
          <div>{COMPANY_ADDRESS}</div>
          <div>{phones}</div>
          <div><a href="mailto:{COMPANY_EMAIL}" style="color: {BRAND_NAVY}; text-decoration: none;">{COMPANY_EMAIL}</a> &nbsp;·&nbsp; VAT {COMPANY_VAT}</div>
          <div style="margin-top: 10px; color: #a1a1aa; font-size: 10px;">This is an automated message from {COMPANY_DISPLAY_NAME}. Please do not reply to this email — use the contact details above.</div>
        </td>
      </tr>
    </table>
    """


def _cta_button(label: str, url: str) -> str:
    if not url:
        return ""
    return f"""
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 24px auto;">
      <tr>
        <td style="background: {BRAND_NAVY}; border-radius: 6px;">
          <a href="{url}" target="_blank" style="display: inline-block; padding: 13px 30px; color: #ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.3px;">
            {label}
          </a>
        </td>
      </tr>
    </table>
    """


def _job_meta_pill(job: dict) -> str:
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0 24px; background: {BG_SOFT}; border-radius: 8px;">
      <tr>
        <td style="padding: 14px 18px; font-family: Arial, sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px; color: {TEXT_BODY};">
            <tr>
              <td style="padding: 4px 0;"><span style="color: {TEXT_MUTED}; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px;">Job</span><br/><strong style="color: {BRAND_NAVY}; font-size: 14px;">#{job.get('job_number', 'N/A')}</strong></td>
              <td style="padding: 4px 0;"><span style="color: {TEXT_MUTED}; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px;">Service</span><br/><strong style="color: {BRAND_NAVY}; font-size: 13px;">{job.get('service_type', 'Standard')}</strong></td>
              <td style="padding: 4px 0;"><span style="color: {TEXT_MUTED}; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px;">Stones</span><br/><strong style="color: {BRAND_NAVY}; font-size: 13px;">{len(job.get('stones', []))}</strong></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    """


# ---------------------------------------------------------------------------
# Table builders (invoked per notification type)
# ---------------------------------------------------------------------------

def generate_stones_table_html(stones: list, include_fees: bool = False) -> str:
    """Intake / general stones table. Optionally include fees column."""
    rows = ""
    total_fee = 0
    for stone in stones:
        fee = stone.get("fee", 0)
        total_fee += fee
        fee_cell = (
            f'<td style="padding: 10px; text-align: right; color: {BRAND_NAVY};">${fee:,.2f}</td>'
            if include_fees
            else ""
        )

        vf = stone.get("verbal_findings", {})
        cert_id = vf.get("certificate_id", "—") if isinstance(vf, dict) else "—"

        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px; text-align: left; font-family: 'Courier New', monospace; font-weight: 600; color: {BRAND_NAVY};">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 10px; text-align: left; color: {TEXT_BODY};">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 10px; text-align: center; color: {TEXT_BODY};">{stone.get('weight', 0)} ct</td>
            <td style="padding: 10px; text-align: center; color: {TEXT_BODY};">{cert_id}</td>
            <td style="padding: 10px; text-align: right; color: {TEXT_BODY};">${stone.get('value', 0):,.2f}</td>
            {fee_cell}
        </tr>"""

    total_row = ""
    if include_fees:
        total_row = f"""
        <tr style="background-color: {BG_SOFT};">
            <td colspan="5" style="padding: 12px; text-align: right; font-weight: 700; color: {BRAND_NAVY};">Total Fee</td>
            <td style="padding: 12px; text-align: right; font-weight: 700; color: {BRAND_NAVY};">${total_fee:,.2f}</td>
        </tr>"""

    fee_header = (
        f'<th style="padding: 10px; text-align: right; color: #ffffff; font-weight: 600;">Fee</th>'
        if include_fees
        else ""
    )

    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #d9e2ec;">
        <thead>
            <tr style="background-color: {BRAND_NAVY};">
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">SKU</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Type</th>
                <th style="padding: 10px; text-align: center; color: #ffffff; font-weight: 600;">Weight</th>
                <th style="padding: 10px; text-align: center; color: #ffffff; font-weight: 600;">Cert. ID</th>
                <th style="padding: 10px; text-align: right; color: #ffffff; font-weight: 600;">Value</th>
                {fee_header}
            </tr>
        </thead>
        <tbody>{rows}{total_row}</tbody>
    </table>"""


def generate_verbal_results_table_html(stones: list, verbal_findings: list) -> str:
    """Verbal results table with core findings (compact for email clients)."""
    rows = ""
    for stone in stones:
        vf = stone.get("verbal_findings", {})
        if not vf and verbal_findings:
            vf = next(
                (v for v in verbal_findings if v.get("stone_id") == stone.get("id")),
                {},
            )

        identification = vf.get("identification", "—") if vf else "—"
        color = vf.get("color", "—") if vf else "—"
        origin = vf.get("origin", "—") if vf else "—"
        treatment = vf.get("comment", "—") if vf else "—"
        cert_id = vf.get("certificate_id", "—") if vf else "—"

        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; font-family: 'Courier New', monospace; font-weight: 600; color: {BRAND_NAVY}; font-size: 12px;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 8px; color: {TEXT_BODY}; font-size: 12px;">{cert_id}</td>
            <td style="padding: 8px; color: {TEXT_BODY}; font-size: 12px;">{identification}</td>
            <td style="padding: 8px; color: {TEXT_BODY}; font-size: 12px;">{color}</td>
            <td style="padding: 8px; color: {TEXT_BODY}; font-size: 12px;">{origin}</td>
            <td style="padding: 8px; color: {TEXT_BODY}; font-size: 12px;">{treatment}</td>
        </tr>"""
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif; border: 1px solid #d9e2ec;">
        <thead>
            <tr style="background-color: {BRAND_NAVY};">
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase;">SKU</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase;">Cert. ID</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase;">Identification</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase;">Color</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase;">Origin</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase;">Treatment</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""


def generate_cert_scans_table_html(stones: list) -> str:
    """Certificate scan download table."""
    rows = ""
    for stone in stones:
        scan_url = stone.get("certificate_scan_url", "")
        if scan_url:
            link = f'<a href="{scan_url}" style="color: {BRAND_NAVY}; text-decoration: none; font-weight: 600;">Download PDF →</a>'
        else:
            link = f'<span style="color: {TEXT_MUTED};">Not available</span>'
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px; font-family: 'Courier New', monospace; font-weight: 600; color: {BRAND_NAVY};">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 10px; color: {TEXT_BODY};">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 10px; color: {TEXT_BODY};">{stone.get('weight', 0)} ct</td>
            <td style="padding: 10px;">{link}</td>
        </tr>"""
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #d9e2ec;">
        <thead>
            <tr style="background-color: {BRAND_NAVY};">
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">SKU</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Type</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Weight</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Certificate Scan</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""


def generate_fees_table_html(job: dict) -> str:
    """Legacy: certificate-unit grouped fees table."""
    certificate_units = job.get("certificate_units", [])
    rows = ""
    for i, unit in enumerate(certificate_units, 1):
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px; color: {TEXT_BODY};">Certificate Unit {i}</td>
            <td style="padding: 10px; color: {TEXT_BODY};">{unit.get('type', 'Standard')}</td>
            <td style="padding: 10px; text-align: right; color: {BRAND_NAVY};">${unit.get('fee', 0):,.2f}</td>
        </tr>"""

    total_fee = job.get("total_fee", 0)
    rows += f"""
    <tr style="background-color: {BG_SOFT};">
        <td colspan="2" style="padding: 12px; text-align: right; font-weight: 700; color: {BRAND_NAVY};">Total Fee</td>
        <td style="padding: 12px; text-align: right; font-weight: 700; color: {BRAND_NAVY};">${total_fee:,.2f}</td>
    </tr>"""

    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #d9e2ec;">
        <thead>
            <tr style="background-color: {BRAND_NAVY};">
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Item</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Type</th>
                <th style="padding: 10px; text-align: right; color: #ffffff; font-weight: 600;">Fee</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""


def _fees_breakdown_table(stones: list, discount: float = 0) -> tuple:
    """Return (fees_table_html, total_due). Shows a single Fee column."""
    rows = ""
    subtotal = 0
    for stone in stones:
        fee = stone.get("fee", 0)
        subtotal += fee
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 9px 10px; font-family: 'Courier New', monospace; font-weight: 600; color: {BRAND_NAVY};">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 9px 10px; color: {TEXT_BODY};">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 9px 10px; color: {TEXT_BODY}; text-align: center;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 9px 10px; color: {BRAND_NAVY}; text-align: right;">${fee:,.2f}</td>
        </tr>"""

    summary_rows = ""
    if discount and discount > 0:
        summary_rows += f"""
        <tr>
            <td colspan="3" style="padding: 9px 10px; text-align: right; color: {TEXT_BODY};">Subtotal</td>
            <td style="padding: 9px 10px; text-align: right; color: {TEXT_BODY};">${subtotal:,.2f}</td>
        </tr>
        <tr>
            <td colspan="3" style="padding: 9px 10px; text-align: right; color: {BRAND_ACCENT};">Discount</td>
            <td style="padding: 9px 10px; text-align: right; color: {BRAND_ACCENT};">-${discount:,.2f}</td>
        </tr>"""

    total_due = max(0, subtotal - (discount or 0))
    summary_rows += f"""
        <tr style="background-color: {BRAND_NAVY};">
            <td colspan="3" style="padding: 12px; text-align: right; font-weight: 700; color: #ffffff;">Total Due (USD)</td>
            <td style="padding: 12px; text-align: right; font-weight: 700; color: #ffffff;">${total_due:,.2f}</td>
        </tr>"""

    html = f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 16px 0; font-family: Arial, sans-serif; font-size: 13px; border: 1px solid #d9e2ec;">
        <thead>
            <tr style="background-color: {BRAND_NAVY};">
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">SKU</th>
                <th style="padding: 10px; text-align: left; color: #ffffff; font-weight: 600;">Type</th>
                <th style="padding: 10px; text-align: center; color: #ffffff; font-weight: 600;">Weight</th>
                <th style="padding: 10px; text-align: right; color: #ffffff; font-weight: 600;">Fee</th>
            </tr>
        </thead>
        <tbody>{rows}{summary_rows}</tbody>
    </table>"""

    return html, total_due


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def _greeting(client_name: str) -> str:
    return (
        f'<p style="color: {TEXT_BODY}; font-size: 15px; margin: 0 0 6px;">'
        f'Hello <strong style="color: {BRAND_NAVY};">{client_name}</strong>,</p>'
    )


def _heading(text: str) -> str:
    return f'<h2 style="color: {BRAND_NAVY}; font-size: 22px; margin: 0 0 12px;">{text}</h2>'


def _intro_p(text: str) -> str:
    return f'<p style="color: {TEXT_BODY}; font-size: 14px; margin: 0 0 6px;">{text}</p>'


def _section_h3(text: str) -> str:
    return (
        f'<h3 style="color: {BRAND_NAVY}; font-size: 15px; margin: 20px 0 6px; '
        f'text-transform: uppercase; letter-spacing: 0.5px;">{text}</h3>'
    )


def _muted_note(text: str) -> str:
    return f'<p style="color: {TEXT_MUTED}; font-size: 12px; margin-top: 16px;"><em>{text}</em></p>'


# ---------- Per-type renderers (each returns (subject, body_inner)) ----------

def _render_stones_accepted(ctx: dict) -> tuple:
    job = ctx["job"]
    subject = f"Job #{ctx['job_number']} · Stones received at the lab"
    body = (
        _heading("Stones received")
        + ctx["greeting"]
        + _intro_p("We have received your stones and logged them into our system. "
                  "You'll receive another update once verbal results are ready.")
        + _job_meta_pill(job)
        + _section_h3("Stones received")
        + generate_stones_table_html(ctx["stones"], include_fees=True)
        + _cta_button("View Job in Portal", ctx["portal_link"])
        + _muted_note("The signed Memo-In document is attached to this email.")
    )
    return subject, body


def _render_verbal_uploaded(ctx: dict) -> tuple:
    job = ctx["job"]
    subject = f"Job #{ctx['job_number']} · Verbal results ready"
    body = (
        _heading("Verbal results available")
        + ctx["greeting"]
        + _intro_p("The preliminary (verbal) findings from our gemologists are now available. "
                  "Full certificates will follow once issued.")
        + _job_meta_pill(job)
        + _section_h3("Verbal findings")
        + generate_verbal_results_table_html(ctx["stones"], ctx["verbal_findings"])
        + _cta_button("View Results in Portal", ctx["portal_link"])
    )
    return subject, body


def _build_stones_table(stones: list, title: str) -> str:
    """Compact Type / Weight / SKU table used for partial-return enumeration."""
    if not stones:
        return ""
    rows = "".join(
        f'<tr>'
        f'<td style="padding: 6px 10px; border: 1px solid #e5e7eb; font-size: 12px; color: {BRAND_NAVY};">{s.get("stone_type", "")}</td>'
        f'<td style="padding: 6px 10px; border: 1px solid #e5e7eb; font-size: 12px; color: {TEXT_BODY};">{s.get("weight", "")} ct</td>'
        f'<td style="padding: 6px 10px; border: 1px solid #e5e7eb; font-size: 12px; font-family: monospace; color: {TEXT_BODY};">{s.get("sku", "")}</td>'
        f'</tr>'
        for s in stones
    )
    return (
        f'<p style="color: {BRAND_NAVY}; font-weight: 600; font-size: 13px; margin: 14px 0 6px;">{title} ({len(stones)})</p>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%; margin-bottom: 8px;">'
        f'<thead><tr>'
        f'<th style="padding: 6px 10px; border: 1px solid #e5e7eb; background: {BRAND_NAVY}; color: #fff; font-size: 11px; text-align: left;">Type</th>'
        f'<th style="padding: 6px 10px; border: 1px solid #e5e7eb; background: {BRAND_NAVY}; color: #fff; font-size: 11px; text-align: left;">Weight</th>'
        f'<th style="padding: 6px 10px; border: 1px solid #e5e7eb; background: {BRAND_NAVY}; color: #fff; font-size: 11px; text-align: left;">SKU</th>'
        f'</tr></thead>'
        f'<tbody>{rows}</tbody>'
        f'</table>'
    )


def _partition_stones_for_return(stones: list) -> tuple:
    """Split stones into (returned, pending) based on stone_status.

    Legacy stones (without stone_status) are treated as returned — preserves
    the pre-partial-return behaviour for existing jobs.
    """
    tracked = [s for s in stones if "stone_status" in s]
    if not tracked:
        return list(stones), []
    returned = [s for s in stones if s.get("stone_status") == "returned"]
    pending = [s for s in stones if s.get("stone_status") == "at_lab"]
    return returned, pending


def _partition_stones_for_cert(stones: list) -> tuple:
    """Split stones into (delivered certs, pending certs) based on cert_status."""
    tracked = [s for s in stones if "cert_status" in s]
    if not tracked:
        return list(stones), []
    delivered = [s for s in stones if s.get("cert_status") == "delivered"]
    pending = [s for s in stones if s.get("cert_status") != "delivered"]
    return delivered, pending


def _render_stones_returned(ctx: dict) -> tuple:
    job = ctx["job"]
    returned, pending = _partition_stones_for_return(ctx["stones"])
    is_partial = bool(pending)
    subject = (
        f"Job #{ctx['job_number']} · Partial return — {len(returned)} of "
        f"{len(returned) + len(pending)} stones ready"
        if is_partial
        else f"Job #{ctx['job_number']} · Stones ready for collection · Payment due"
    )
    # Fees table only covers the stones that actually came back in this shipment
    fees_table, amount_due = _fees_breakdown_table(returned, job.get("discount", 0))

    due_banner = f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0;">
          <tr>
            <td style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 14px 16px;">
              <div style="color: #78350f; font-weight: 700; font-size: 14px;">Payment of ${amount_due:,.2f} is required upon pickup.</div>
              <div style="color: #92400e; font-size: 12px; margin-top: 3px;">Please bring a valid ID when collecting your stones.</div>
            </td>
          </tr>
        </table>
    """

    pay_cta = _cta_button("Pay Now Online", ctx["payment_url"]) if ctx["payment_url"] else ""

    returned_table = _build_stones_table(returned, "Returned in this shipment")
    pending_table = _build_stones_table(pending, "Still at the lab")
    pending_note = (
        '<p style="color: #78350f; font-size: 12px; margin: 4px 0 0;">'
        'These stones are still undergoing analysis and will be shipped in a follow-up delivery.'
        '</p>'
        if is_partial else ""
    )

    body = (
        _heading("Partial return — stones ready for collection" if is_partial else "Stones ready for collection")
        + ctx["greeting"]
        + f'<p style="color: {TEXT_BODY}; font-size: 14px; margin: 0 0 6px;">'
          f'<strong style="color: {BRAND_NAVY};">'
          f'{"A portion of your stones have" if is_partial else "Your stones have"} returned '
          f'to our Israel office and are ready for collection.</strong></p>'
        + _job_meta_pill(job)
        + returned_table
        + pending_table
        + pending_note
        + due_banner
        + pay_cta
        + _section_h3("Fee breakdown" + (" (for returned stones)" if is_partial else ""))
        + fees_table
        + _muted_note("The detailed invoice is attached to this email.")
    )
    return subject, body


def _render_cert_uploaded(ctx: dict) -> tuple:
    job = ctx["job"]
    subject = f"Job #{ctx['job_number']} · Certificate scans available"
    body = (
        _heading("Certificate scans available")
        + ctx["greeting"]
        + _intro_p("The digital scans of your certificates are ready for download. "
                  "Physical certificates will follow shortly.")
        + _job_meta_pill(job)
        + _section_h3("Certificate downloads")
        + generate_cert_scans_table_html(ctx["stones"])
        + _cta_button("View All in Portal", ctx["portal_link"])
    )
    return subject, body


def _render_cert_returned(ctx: dict) -> tuple:
    job = ctx["job"]
    delivered, cert_pending = _partition_stones_for_cert(ctx["stones"])
    is_partial = bool(cert_pending) and bool(delivered)
    subject = (
        f"Job #{ctx['job_number']} · Partial certificates ready "
        f"({len(delivered)} of {len(delivered) + len(cert_pending)})"
        if is_partial
        else f"Job #{ctx['job_number']} · Physical certificates ready"
    )
    cert_count = len([s for s in delivered if s.get("certificate_scan_url")]) or len(delivered)

    green_banner = """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0;">
          <tr>
            <td style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 16px;">
              <div style="color: #065f46; font-size: 14px;">Please visit our office to collect your certificates along with your stones.</div>
            </td>
          </tr>
        </table>
    """

    delivered_table = _build_stones_table(delivered, "Certificates ready") if is_partial else ""
    pending_table = _build_stones_table(cert_pending, "Certificates still pending") if is_partial else ""
    pending_note = (
        '<p style="color: #78350f; font-size: 12px; margin: 4px 0 0;">'
        'These certificates are still being prepared and will be delivered in a follow-up shipment.'
        '</p>'
        if is_partial else ""
    )

    body = (
        _heading("Partial certificates ready" if is_partial else "Physical certificates ready")
        + ctx["greeting"]
        + f'<p style="color: {TEXT_BODY}; font-size: 14px; margin: 0 0 6px;">'
          f'<strong style="color: {BRAND_NAVY};">'
          f'{"Some of your physical certificates have" if is_partial else "Your physical certificates have"} '
          f'arrived at our office and are ready for final collection.</strong></p>'
        + green_banner
        + _job_meta_pill(job)
        + delivered_table
        + pending_table
        + pending_note
        + f'<p style="color: {TEXT_BODY}; font-size: 13px; margin: 16px 0 4px;"><strong>Total certificates ready:</strong> {cert_count}</p>'
        + f'<p style="color: {TEXT_BODY}; font-size: 13px;">Thank you for choosing {COMPANY_DISPLAY_NAME} for your gemstone certification.</p>'
        + _cta_button("View Job in Portal", ctx["portal_link"])
    )
    return subject, body


def _format_payment_timestamp(raw) -> str:
    if not raw:
        return "—"
    if isinstance(raw, str):
        return raw
    try:
        return raw.strftime("%d %b %Y, %H:%M")
    except Exception:
        return str(raw)


def _render_manual_payment_receipt(ctx: dict) -> tuple:
    job = ctx["job"]
    latest_payment = job.get("latest_payment") or {}
    payment_id = latest_payment.get("id", "—")
    paid_amount = latest_payment.get("amount", 0) or 0
    paid_at_display = _format_payment_timestamp(latest_payment.get("recorded_at"))

    total_fee = job.get("total_fee", 0) or 0
    discount = job.get("discount", 0) or 0
    net_total = max(0, total_fee - discount)
    total_paid = job.get("payment_total_paid", 0) or 0
    balance = max(0, net_total - total_paid)
    is_fully_paid = balance <= 0

    subject = f"Receipt · Job #{ctx['job_number']} · ${paid_amount:,.2f} received"

    receipt_id_block = f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0 20px;">
          <tr>
            <td style="background: {BRAND_NAVY}; color: #ffffff; padding: 18px 22px; border-radius: 8px;">
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #d4d4d8;">Payment Receipt</div>
              <div style="font-size: 24px; font-weight: 800; letter-spacing: 1px; margin-top: 4px;">{payment_id}</div>
              <div style="font-size: 12px; color: #d4d4d8; margin-top: 4px;">Recorded {paid_at_display}</div>
            </td>
          </tr>
        </table>
    """

    if is_fully_paid:
        status_banner = f"""
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 14px 0;">
              <tr>
                <td style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 4px;">
                  <div style="color: #065f46; font-weight: 700; font-size: 13px;">Paid in full — Thank you!</div>
                  <div style="color: #047857; font-size: 11px; margin-top: 2px;">Total received: ${total_paid:,.2f} / ${net_total:,.2f}</div>
                </td>
              </tr>
            </table>
        """
    else:
        status_banner = f"""
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 14px 0;">
              <tr>
                <td style="background: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; border-radius: 4px;">
                  <div style="color: #78350f; font-weight: 700; font-size: 13px;">${total_paid:,.2f} of ${net_total:,.2f} paid</div>
                  <div style="color: #92400e; font-size: 11px; margin-top: 2px;">Balance remaining: ${balance:,.2f}</div>
                </td>
              </tr>
            </table>
        """

    body = (
        _heading("Payment received")
        + ctx["greeting"]
        + f'<p style="color: {TEXT_BODY}; font-size: 14px; margin: 0 0 6px;">'
          f'We\'ve recorded a payment of <strong style="color: {BRAND_NAVY};">${paid_amount:,.2f}</strong> '
          f'toward <strong>Job #{ctx["job_number"]}</strong>.</p>'
        + receipt_id_block
        + _job_meta_pill(job)
        + status_banner
        + _section_h3("Job breakdown")
        + generate_stones_table_html(ctx["stones"], include_fees=True)
        + _cta_button("View Full Receipt", f"{PORTAL_URL}/dashboard/receipt/{payment_id}")
        + f'<p style="color: {TEXT_MUTED}; font-size: 12px; margin-top: 16px;">'
          f'Please keep this email for your records. The payment ID '
          f'<strong style="color: {BRAND_NAVY};">{payment_id}</strong> can be used to look up '
          f'this receipt anytime in the client portal.</p>'
    )
    return subject, body


def _render_welcome(ctx: dict) -> tuple:
    contact = ctx["client"].get("email", "")
    subject = f"Welcome to {COMPANY_DISPLAY_NAME}"
    body = (
        _heading(f"Welcome to {COMPANY_DISPLAY_NAME}")
        + ctx["greeting"]
        + '<p style="color: ' + TEXT_BODY + '; font-size: 14px; margin: 0 0 10px;">'
          "We're pleased to have you as a client. Our new online portal gives you real-time "
          "visibility into every job — stone intake, verbal results, certificate downloads "
          "and payments — all in one place.</p>"
        + f'<h3 style="color: {BRAND_NAVY}; font-size: 14px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">What you can do in the portal</h3>'
        + f'<ul style="color: {TEXT_BODY}; font-size: 13px; padding-left: 20px; line-height: 1.7;">'
          "<li>Track your jobs from intake to certificate collection</li>"
          "<li>Download verbal results and certificate scans</li>"
          "<li>Review fees and pay invoices online</li>"
          "<li>Update your contact details and password anytime</li>"
          "</ul>"
        + f'<p style="color: {TEXT_BODY}; font-size: 13px; margin: 14px 0 0;">'
          f'Sign in using your registered email: <strong style="color: {BRAND_NAVY};">{contact}</strong></p>'
        + _cta_button("Open Client Portal", PORTAL_URL)
        + f'<p style="color: {TEXT_MUTED}; font-size: 12px; margin-top: 16px;">'
          "If this is your first time logging in, click <strong>Forgot password?</strong> "
          "on the login screen to set a password.</p>"
    )
    return subject, body


def _render_default(ctx: dict) -> tuple:
    subject = f"Job #{ctx['job_number']} · Update from {COMPANY_DISPLAY_NAME}"
    body = (
        _heading("Job update")
        + ctx["greeting"]
        + f'<p style="color: {TEXT_BODY}; font-size: 14px;">'
          f'Your job <strong>#{ctx["job_number"]}</strong> has been updated. '
          "Please log in to view the latest details.</p>"
        + _cta_button("View Job in Portal", ctx["portal_link"])
    )
    return subject, body


# Dispatch table keeps complexity flat and each branch independently testable.
_TEMPLATE_RENDERERS = {
    "stones_accepted": _render_stones_accepted,
    "verbal_uploaded": _render_verbal_uploaded,
    "stones_returned": _render_stones_returned,
    "cert_uploaded": _render_cert_uploaded,
    "cert_returned": _render_cert_returned,
    "manual_payment_receipt": _render_manual_payment_receipt,
    "welcome": _render_welcome,
}


def _wrap_email(subject: str, body_inner: str) -> str:
    body = f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 28px 28px 12px; font-family: Arial, sans-serif;">
          {body_inner}
        </td>
      </tr>
    </table>
    """
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.55; margin: 0; padding: 0; background-color: #f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width: 620px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(20, 20, 23, 0.08);">
            <tr><td>{_header_html()}</td></tr>
            <tr><td>{body}</td></tr>
            <tr><td>{_footer_html()}</td></tr>
          </table>
        </td>
      </tr>
    </table>
</body>
</html>
"""


def build_notification_email_html(
    notification_type: str, job: dict, client: dict, payment_url: str = ""
) -> tuple:
    """Build HTML email content for the given notification type.

    Returns (subject, html_body). Delegates to type-specific renderers via a
    dispatch dict, which keeps this function's complexity at O(1).
    """
    job_number = job.get("job_number", "N/A")
    client_name = client.get("name", "Valued Customer")

    ctx = {
        "job": job,
        "client": client,
        "job_number": job_number,
        "client_name": client_name,
        "stones": job.get("stones", []),
        "verbal_findings": job.get("verbal_findings", []),
        "portal_link": f"{PORTAL_URL}/dashboard/jobs",
        "payment_url": payment_url,
        "greeting": _greeting(client_name),
    }

    renderer = _TEMPLATE_RENDERERS.get(notification_type, _render_default)
    subject, body_inner = renderer(ctx)

    return subject, _wrap_email(subject, body_inner)
