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
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from database import db
from auth import get_current_user, require_admin
from utils import download_logo

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
    for i, stone in enumerate(job.get('stones', []), 1):
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


def _build_invoice_pdf_buffer(job: dict, client: dict, branch: dict) -> BytesIO:
    """Render the invoice PDF for a job into an in-memory BytesIO.

    Excludes cancelled stones (they don't belong on the invoice and would
    inflate totals). All numeric fields are coerced defensively so a stone
    with `fee: null` or a missing `value` field doesn't crash the request.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#1a365d'))
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, spaceAfter=6)

    elements = []
    logo_data = download_logo()
    if logo_data:
        elements.append(RLImage(logo_data, width=2*inch, height=0.8*inch))

    elements.append(Spacer(1, 0.3*inch))
    elements.append(Paragraph("INVOICE", title_style))
    elements.append(Paragraph(f"Job #{job.get('job_number', 'N/A')}", header_style))
    elements.append(Paragraph(f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}", header_style))
    elements.append(Paragraph(f"Client: {client.get('name', 'N/A') if client else 'N/A'}", header_style))
    elements.append(Paragraph(f"Service Type: {job.get('service_type', '—')}", header_style))
    elements.append(Spacer(1, 0.3*inch))

    # Only live stones go on the invoice.
    stones = [s for s in job.get('stones', []) if not s.get('cancelled')]
    has_actual_fees = any(s.get('actual_fee') is not None for s in stones)

    if has_actual_fees:
        table_data = [['#', 'SKU', 'Value', 'Color Test', 'Est. Fee', 'Actual Fee']]
    else:
        table_data = [['#', 'SKU', 'Value (USD)', 'Color Test', 'Fee (USD)']]

    total_estimated = 0.0
    total_actual = 0.0
    for i, stone in enumerate(stones, 1):
        estimated_fee = _coerce_float(stone.get('fee'))
        actual_fee_raw = stone.get('actual_fee')
        actual_fee = _coerce_float(actual_fee_raw) if actual_fee_raw is not None else None
        total_estimated += estimated_fee
        total_actual += actual_fee if actual_fee is not None else estimated_fee

        if has_actual_fees:
            table_data.append([
                str(i),
                str(stone.get('sku', '')),
                _format_money(stone.get('value')),
                'Yes' if stone.get('color_stability_test') else 'No',
                _format_money(estimated_fee),
                _format_money(actual_fee) if actual_fee is not None else '-',
            ])
        else:
            table_data.append([
                str(i),
                str(stone.get('sku', '')),
                _format_money(stone.get('value')),
                'Yes (+$50)' if stone.get('color_stability_test') else 'No',
                _format_money(estimated_fee),
            ])

    if has_actual_fees:
        table_data.append(['', '', '', 'TOTAL:', _format_money(total_estimated), _format_money(total_actual)])
        col_widths = [0.4*inch, 1.5*inch, 1*inch, 0.8*inch, 0.9*inch, 0.9*inch]
    else:
        table_data.append(['', '', '', 'TOTAL:', _format_money(total_estimated)])
        col_widths = [0.5*inch, 1.8*inch, 1.2*inch, 1.2*inch, 1*inch]

    table = Table(table_data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('FONTNAME', (-2, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (-2, -1), (-1, -1), colors.HexColor('#e2e8f0')),
    ]))
    elements.append(table)

    elements.append(Spacer(1, 0.3*inch))
    amount_due = total_actual if has_actual_fees else total_estimated
    elements.append(Paragraph(f"<b>Amount Due: {_format_money(amount_due)}</b>", header_style))
    elements.append(Paragraph("Payment is due upon collection of stones.", header_style))

    elements.append(Spacer(1, 0.5*inch))
    if branch:
        footer_style = ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)
        elements.append(Paragraph(f"Office: {branch.get('name', '')}", footer_style))
        elements.append(Paragraph(branch.get('address', ''), footer_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer


@router.get("/jobs/{job_id}/pdf/invoice")
async def generate_invoice_pdf(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    client = await db.clients.find_one({"_id": ObjectId(job["client_id"])}) if job.get("client_id") else None
    branch = await db.branches.find_one({"_id": ObjectId(job["branch_id"])}) if job.get("branch_id") else None

    try:
        # ReportLab is synchronous — run it in a thread so it doesn't
        # block the event loop while we build the PDF.
        buffer = await asyncio.to_thread(_build_invoice_pdf_buffer, job, client, branch)
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

    try:
        # ReportLab is synchronous → run it off the event loop.
        buffer = await asyncio.to_thread(_build_invoice_pdf_buffer, job, client, branch)
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
    for i, stone in enumerate(job.get('stones', []), 1):
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
