from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from datetime import datetime
from io import BytesIO
from bson import ObjectId
import asyncio
import os
import logging

import cloudinary
import cloudinary.uploader
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

from database import db
from auth import get_current_user, require_admin
from utils import download_logo, download_square_logo
import uuid

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/jobs/{job_id}/pdf/memo-in")
async def generate_memo_in_pdf(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#1a365d'))
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=6)

    elements = []

    logo_data = download_logo()
    if logo_data:
        logo = RLImage(logo_data, width=2*inch, height=0.8*inch)
        elements.append(logo)

    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"MEMO-IN RECEIPT", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {job['created_at'].strftime('%Y-%m-%d %H:%M')}", header_style))
    elements.append(Paragraph(f"Client: {client['name'] if client else 'N/A'}", header_style))
    elements.append(Paragraph(f"Service Type: {job['service_type']}", header_style))
    elements.append(Spacer(1, 0.3*inch))

    table_data = [['#', 'SKU', 'Type', 'Weight (ct)', 'Shape', 'Value (USD)']]
    for i, stone in enumerate([s for s in job.get('stones', []) if not s.get('cancelled')], 1):
        table_data.append([
            str(i),
            stone['sku'],
            stone['stone_type'],
            f"{stone['weight']:.3f}",
            stone['shape'],
            f"${stone['value']:,.2f}"
        ])

    table = Table(table_data, colWidths=[0.5*inch, 1.5*inch, 1*inch, 1*inch, 1*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
    ]))
    elements.append(table)

    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"Total Stones: {job['total_stones']}", header_style))
    elements.append(Paragraph(f"Total Declared Value: ${job['total_value']:,.2f}", header_style))

    elements.append(Spacer(1, 0.5*inch))
    if branch:
        elements.append(Paragraph(f"Office: {branch['name']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
        elements.append(Paragraph(f"{branch['address']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))

    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=memo_in_job_{job['job_number']}.pdf"}
    )


# --------------------------------------------------------------------------
#  Bashari brand constants for invoice rendering
# --------------------------------------------------------------------------

def _format_money(v) -> str:
    """Render numeric value as `$1,234.56`. Tolerates None / missing / str."""
    try:
        return f"${float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def _coerce_float(v) -> float:
    """Best-effort numeric coercion. None / non-numeric → 0.0."""
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


COMPANY_NAME = "ELIYAHU BASHARI DIAMONDS LTD."
COMPANY_FOOTER_ADDRESS = (
    "ELIYAHU BASHARI DIAMONDS LTD. · "
    "Zeev Jabotinsky St 1, Maccabi Building, Floor 23, Room 42-44, "
    "Ramat Gan, 5252001 Israel"
)
COMPANY_FOOTER_CONTACT = (
    "T +972-3-7521295 · M +972-54-2989805 · lab@bashari.co · VAT No. 513180083"
)

WIRE_DETAILS = [
    ("Account Name", "ELIYAHU BASHARI DIAMONDS LTD."),
    ("Bank Name", "Bank Mizrahi Tefahot"),
    ("Account No.", "164265"),
    ("IBAN / ACH Routing", "IL600204660000000164265"),
    ("SWIFT Code", "MIZBILITDMD"),
]


def _draw_invoice_chrome(canvas, doc):
    """Page-level chrome (header + footer) drawn on every page.

    Header: square "B" mark centered, company name centered beneath it,
    hairline rule. Footer: hairline rule + two centered lines (address +
    contact). Black-only.
    """
    canvas.saveState()
    page_w, page_h = doc.pagesize

    # ---- Header (stacked: logo above, company name below, centered) ----
    logo_size = 0.55 * inch
    logo_x = (page_w - logo_size) / 2
    logo_y = page_h - 0.55 * inch  # top of logo
    logo = download_square_logo()
    if logo:
        try:
            from reportlab.lib.utils import ImageReader
            canvas.drawImage(
                ImageReader(logo),
                x=logo_x,
                y=logo_y - logo_size + 0.1 * inch,
                width=logo_size,
                height=logo_size,
                mask='auto',
                preserveAspectRatio=True,
            )
        except Exception as e:
            logger.warning(f"Could not draw header logo: {e}")
    canvas.setFillColor(colors.black)
    canvas.setFont('Helvetica-Bold', 11)
    canvas.drawCentredString(page_w / 2, logo_y - logo_size + 0.0 * inch, COMPANY_NAME)
    # hairline below the company name
    rule_y = logo_y - logo_size - 0.1 * inch
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.6)
    canvas.line(0.55 * inch, rule_y, page_w - 0.55 * inch, rule_y)

    # ---- Footer (two centered lines + rule + page number) ----
    footer_rule_y = 0.85 * inch
    canvas.line(0.55 * inch, footer_rule_y, page_w - 0.55 * inch, footer_rule_y)
    canvas.setFont('Helvetica', 8)
    canvas.drawCentredString(page_w / 2, footer_rule_y - 0.2 * inch, COMPANY_FOOTER_ADDRESS)
    canvas.drawCentredString(page_w / 2, footer_rule_y - 0.36 * inch, COMPANY_FOOTER_CONTACT)
    canvas.setFont('Helvetica', 7)
    canvas.drawRightString(page_w - 0.55 * inch, 0.35 * inch, f"Page {doc.page}")
    canvas.restoreState()


def _build_invoice_pdf_buffer(job: dict, client: dict, branch: dict, payment_url: str = "") -> BytesIO:
    """Render the invoice PDF for a job into an in-memory BytesIO.

    Black-only palette, branded header/footer, columns: #, SKU, Stone Type,
    Weight, Value, Fees. Excludes cancelled stones. Defensively coerces
    None / missing numeric fields. If `payment_url` is supplied, a clickable
    "Pay Online" link is rendered next to the wire-transfer block.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=1.5 * inch,    # taller for stacked logo + company name
        bottomMargin=1.25 * inch,  # taller for 2-line footer
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        title="Invoice",
    )

    styles = getSampleStyleSheet()
    h_style = ParagraphStyle(
        'InvHead', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=18, spaceAfter=4, textColor=colors.black, leading=22,
    )
    label = ParagraphStyle(
        'Label', parent=styles['Normal'], fontName='Helvetica',
        fontSize=8, textColor=colors.black, leading=11, spaceAfter=2,
        letterSpacing=0.5,
    )
    val = ParagraphStyle(
        'Val', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=10, textColor=colors.black, leading=12, spaceAfter=2,
    )
    body = ParagraphStyle(
        'Body', parent=styles['Normal'], fontName='Helvetica',
        fontSize=9, textColor=colors.black, leading=13,
    )
    note = ParagraphStyle(
        'Note', parent=styles['Normal'], fontName='Helvetica-Oblique',
        fontSize=8, textColor=colors.black, leading=11,
    )
    section = ParagraphStyle(
        'Section', parent=styles['Normal'], fontName='Helvetica-Bold',
        fontSize=10, textColor=colors.black, leading=12, spaceBefore=6, spaceAfter=4,
    )

    elements = []

    # --- Title + meta block (two columns) -----------------------------------
    invoice_no = f"INV-{job.get('job_number', 'NA'):0>5}"
    today = datetime.utcnow().strftime('%d %b %Y')
    client_name = (client.get('name') if client else None) or 'N/A'
    company = (client.get('company') if client else None) or ''

    meta_left = [
        [Paragraph('INVOICE', h_style)],
        [Paragraph('INVOICE NO.', label)],
        [Paragraph(invoice_no, val)],
        [Paragraph('JOB', label)],
        [Paragraph(f"#{job.get('job_number', '—'):0>5}", val)],
    ]
    meta_right = [
        [Paragraph('DATE', label)],
        [Paragraph(today, val)],
        [Paragraph('BILL TO', label)],
        [Paragraph(client_name, val)],
        [Paragraph(company, body) if company else Paragraph('', body)],
    ]
    meta_tbl = Table(
        [[Table(meta_left, colWidths=[3.2 * inch]),
          Table(meta_right, colWidths=[3.6 * inch])]],
        colWidths=[3.3 * inch, 3.7 * inch],
    )
    meta_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(meta_tbl)
    elements.append(Spacer(1, 0.25 * inch))

    # --- Line items table ---------------------------------------------------
    stones = [s for s in job.get('stones', []) if not s.get('cancelled')]
    rows = [['#', 'SKU', 'STONE TYPE', 'WEIGHT (CT)', 'VALUE (USD)', 'FEES (USD)']]
    total_value = 0.0
    total_fee = 0.0
    for i, stone in enumerate(stones, 1):
        stone_value = _coerce_float(stone.get('value'))
        actual_fee_raw = stone.get('actual_fee')
        fee = _coerce_float(actual_fee_raw) if actual_fee_raw is not None else _coerce_float(stone.get('fee'))
        total_value += stone_value
        total_fee += fee
        weight = _coerce_float(stone.get('weight'))
        rows.append([
            str(i),
            str(stone.get('sku', '')),
            str(stone.get('stone_type', '')),
            f"{weight:.2f}" if weight else '—',
            _format_money(stone_value),
            _format_money(fee),
        ])

    if not stones:
        rows.append(['—', '—', 'No stones on this invoice', '—', '—', '—'])

    rows.append(['', '', '', 'TOTAL', _format_money(total_value), _format_money(total_fee)])

    line_tbl = Table(
        rows,
        colWidths=[0.45 * inch, 1.45 * inch, 1.4 * inch, 1.1 * inch, 1.25 * inch, 1.25 * inch],
        repeatRows=1,
    )
    line_tbl.setStyle(TableStyle([
        # header row
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.black),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        # body rows
        ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -2), 9),
        ('TEXTCOLOR', (0, 1), (-1, -2), colors.black),
        ('LINEBELOW', (0, 1), (-1, -2), 0.25, colors.HexColor('#cccccc')),
        ('TOPPADDING', (0, 1), (-1, -2), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -2), 6),
        # total row
        ('FONTNAME', (3, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 9),
        ('LINEABOVE', (3, -1), (-1, -1), 1, colors.black),
        ('TOPPADDING', (0, -1), (-1, -1), 8),
        # alignment
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(line_tbl)

    elements.append(Spacer(1, 0.2 * inch))
    elements.append(Paragraph(
        f"<b>Amount Due:</b>&nbsp;&nbsp;&nbsp;<font size=12>{_format_money(total_fee)}</font>",
        ParagraphStyle('Due', parent=val, fontSize=11, alignment=TA_RIGHT, leading=14),
    ))
    elements.append(Spacer(1, 0.25 * inch))

    # --- Payment terms ------------------------------------------------------
    elements.append(Paragraph('PAYMENT TERMS', section))
    elements.append(Paragraph('Due upon collection of gemstones.', body))
    elements.append(Spacer(1, 0.2 * inch))

    # --- Wire instructions + online payment (two columns) ------------------
    wire_rows = [[Paragraph(f'<b>{k}</b>', body), Paragraph(v, body)] for k, v in WIRE_DETAILS]
    wire_inner = Table(wire_rows, colWidths=[1.4 * inch, 2.2 * inch])
    wire_inner.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    pay_online_cell = []
    if payment_url:
        pay_online_cell = [
            Paragraph('PAY ONLINE', section),
            Paragraph(
                'Settle this invoice instantly with credit card or BIT.',
                body,
            ),
            Spacer(1, 0.12 * inch),
            Paragraph(
                f'<font color="black"><b><u>'
                f'<link href="{payment_url}">CLICK TO PAY</link>'
                f'</u></b></font>',
                ParagraphStyle('PayLink', parent=body, fontSize=11, leading=14, alignment=TA_LEFT),
            ),
            Spacer(1, 0.08 * inch),
            Paragraph(
                'Click the link above to pay by credit card or BIT. No login required.',
                note,
            ),
        ]
    else:
        pay_online_cell = [Paragraph('', body)]

    two_col = Table(
        [[
            [Paragraph('WIRE TRANSFER', section), wire_inner],
            pay_online_cell,
        ]],
        colWidths=[3.7 * inch, 3.3 * inch],
    )
    two_col.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('LINEBEFORE', (1, 0), (1, 0), 0.5, colors.HexColor('#cccccc')),
        ('LEFTPADDING', (1, 0), (1, 0), 14),
    ]))
    elements.append(KeepTogether(two_col))

    doc.build(elements, onFirstPage=_draw_invoice_chrome, onLaterPages=_draw_invoice_chrome)
    buffer.seek(0)
    return buffer


async def _get_or_create_payment_url(job_id: str, job: dict) -> str:
    """Return a customer payment URL for this invoice, minting a token if needed."""
    frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
    if not frontend_url:
        return ''
    token = job.get('payment_token')
    if not token:
        token = str(uuid.uuid4())
        await db.jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {"payment_token": token, "updated_at": datetime.utcnow()}},
        )
    return f"{frontend_url}/pay?token={token}"


@router.get("/jobs/{job_id}/pdf/invoice")
async def generate_invoice_pdf(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])}) if job.get("client_id") else None
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])}) if job.get("branch_id") else None
    payment_url = await _get_or_create_payment_url(job_id, job)

    try:
        # ReportLab is synchronous — run it in a thread so it doesn't
        # block the event loop while we build the PDF.
        buffer = await asyncio.to_thread(_build_invoice_pdf_buffer, job, client, branch, payment_url)
    except Exception as e:
        logger.exception(f"Invoice PDF build failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not render invoice: {e}")

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_job_{job.get('job_number','x')}.pdf"}
    )


@router.post("/jobs/{job_id}/generate-invoice")
async def generate_and_save_invoice(job_id: str, user: dict = Depends(require_admin)):
    """Generate invoice PDF and save it to Cloudinary, storing URL in job."""
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])}) if job.get("client_id") else None
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])}) if job.get("branch_id") else None
    payment_url = await _get_or_create_payment_url(job_id, job)

    try:
        # ReportLab is synchronous → run it off the event loop.
        buffer = await asyncio.to_thread(_build_invoice_pdf_buffer, job, client, branch, payment_url)
    except Exception as e:
        logger.exception(f"Invoice PDF build failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not render invoice: {e}")

    try:
        filename = f"invoice_job_{job['job_number']}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        # CRITICAL: cloudinary.uploader.upload is a *synchronous* call (uses
        # `requests` under the hood). Calling it directly from this async
        # route would block the entire uvicorn event loop for the duration
        # of the HTTP upload to Cloudinary. With a single worker (the
        # production default), that means every concurrent request — even
        # `/api/health` — sits queued for the whole upload, which often
        # exceeds Cloudflare's 30s edge timeout and surfaces as a
        # site-wide 520 outage. Offloading to a thread keeps the loop free.
        def _do_upload() -> dict:
            return cloudinary.uploader.upload(
                buffer,
                folder="invoices",
                public_id=filename,
                resource_type="raw",
                timeout=25,
            )

        upload_result = await asyncio.wait_for(
            asyncio.to_thread(_do_upload),
            timeout=28,  # belt-and-suspenders: kill the thread if Cloudinary stalls past Cloudflare's edge.
        )
        invoice_url = upload_result.get('secure_url')

        await db.jobs.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {
                "invoice_url": invoice_url,
                "invoice_filename": f"{filename}.pdf",
                "invoice_generated_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )

        return {
            "message": "Invoice generated successfully",
            "invoice_url": invoice_url,
            "filename": f"{filename}.pdf"
        }
    except asyncio.TimeoutError:
        logger.error(f"Cloudinary upload timed out for job {job_id}")
        raise HTTPException(status_code=504, detail="Invoice upload timed out. Please try again.")
    except Exception as e:
        logger.exception(f"Cloudinary upload failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save invoice: {e}")


@router.get("/jobs/{job_id}/pdf/shipment")
async def generate_shipment_pdf(job_id: str, user: dict = Depends(require_admin)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])})
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])})

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#1a365d'))
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=6)

    elements = []

    logo_data = download_logo()
    if logo_data:
        logo = RLImage(logo_data, width=2*inch, height=0.8*inch)
        elements.append(logo)

    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"SHIPMENT DOCUMENT", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}", header_style))
    elements.append(Spacer(1, 0.2*inch))

    if branch:
        elements.append(Paragraph(f"<b>FROM:</b> {branch['address']}", header_style))
        elements.append(Paragraph(f"<b>TO:</b> GRS Gemresearch Lab HK", header_style))
    elements.append(Spacer(1, 0.3*inch))

    table_data = [['#', 'SKU', 'Type', 'Weight (ct)', 'Shape', 'Value (USD)']]
    for i, stone in enumerate([s for s in job.get('stones', []) if not s.get('cancelled')], 1):
        table_data.append([
            str(i),
            stone['sku'],
            stone['stone_type'],
            f"{stone['weight']:.3f}",
            stone['shape'],
            f"${stone['value']:,.2f}"
        ])

    table = Table(table_data, colWidths=[0.5*inch, 1.5*inch, 1*inch, 1*inch, 1*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
    ]))
    elements.append(table)

    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph(f"Total Stones: {job['total_stones']}", header_style))
    elements.append(Paragraph(f"Total Declared Value: ${job['total_value']:,.2f}", header_style))

    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=shipment_job_{job['job_number']}.pdf"}
    )
