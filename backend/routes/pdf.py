from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from datetime import datetime
from io import BytesIO
from bson import ObjectId
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


@router.get("/jobs/{job_id}/pdf/invoice")
async def generate_invoice_pdf(job_id: str, user: dict = Depends(get_current_user)):
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
    elements.append(Paragraph(f"INVOICE", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}", header_style))
    elements.append(Paragraph(f"Client: {client['name'] if client else 'N/A'}", header_style))
    elements.append(Paragraph(f"Service Type: {job['service_type']}", header_style))
    elements.append(Spacer(1, 0.3*inch))

    has_actual_fees = any(stone.get('actual_fee') is not None for stone in job.get('stones', []))

    if has_actual_fees:
        table_data = [['#', 'SKU', 'Value', 'Color Test', 'Est. Fee', 'Actual Fee']]
    else:
        table_data = [['#', 'SKU', 'Value (USD)', 'Color Test', 'Fee (USD)']]

    total_estimated = 0
    total_actual = 0

    for i, stone in enumerate(job.get('stones', []), 1):
        estimated_fee = stone.get('fee', 0)
        actual_fee = stone.get('actual_fee')
        total_estimated += estimated_fee
        total_actual += actual_fee if actual_fee is not None else estimated_fee

        if has_actual_fees:
            table_data.append([
                str(i),
                stone['sku'],
                f"${stone['value']:,.2f}",
                'Yes' if stone.get('color_stability_test') else 'No',
                f"${estimated_fee:.2f}",
                f"${actual_fee:.2f}" if actual_fee is not None else '-'
            ])
        else:
            table_data.append([
                str(i),
                stone['sku'],
                f"${stone['value']:,.2f}",
                'Yes (+$50)' if stone.get('color_stability_test') else 'No',
                f"${estimated_fee:.2f}"
            ])

    if has_actual_fees:
        table_data.append(['', '', '', 'TOTAL:', f"${total_estimated:.2f}", f"${total_actual:.2f}"])
        col_widths = [0.4*inch, 1.5*inch, 1*inch, 0.8*inch, 0.9*inch, 0.9*inch]
    else:
        table_data.append(['', '', '', 'TOTAL:', f"${total_estimated:.2f}"])
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
    elements.append(Paragraph(f"<b>Amount Due: ${amount_due:.2f}</b>", header_style))
    elements.append(Paragraph(f"Payment is due upon collection of stones.", header_style))

    elements.append(Spacer(1, 0.5*inch))
    if branch:
        elements.append(Paragraph(f"Office: {branch['name']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
        elements.append(Paragraph(f"{branch['address']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))

    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_job_{job['job_number']}.pdf"}
    )


@router.post("/jobs/{job_id}/generate-invoice")
async def generate_and_save_invoice(job_id: str, user: dict = Depends(require_admin)):
    """Generate invoice PDF and save it to Cloudinary, storing URL in job"""
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
    elements.append(Paragraph(f"INVOICE", title_style))
    elements.append(Paragraph(f"Job #{job['job_number']}", header_style))
    elements.append(Paragraph(f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}", header_style))
    elements.append(Paragraph(f"Client: {client['name'] if client else 'N/A'}", header_style))
    elements.append(Paragraph(f"Service Type: {job['service_type']}", header_style))
    elements.append(Spacer(1, 0.3*inch))

    has_actual_fees = any(stone.get('actual_fee') is not None for stone in job.get('stones', []))

    if has_actual_fees:
        table_data = [['#', 'SKU', 'Value', 'Color Test', 'Est. Fee', 'Actual Fee']]
    else:
        table_data = [['#', 'SKU', 'Value (USD)', 'Color Test', 'Fee (USD)']]

    total_estimated = 0
    total_actual = 0

    for i, stone in enumerate(job.get('stones', []), 1):
        estimated_fee = stone.get('fee', 0)
        actual_fee = stone.get('actual_fee')
        total_estimated += estimated_fee
        total_actual += actual_fee if actual_fee is not None else estimated_fee

        if has_actual_fees:
            table_data.append([
                str(i),
                stone['sku'],
                f"${stone['value']:,.2f}",
                'Yes' if stone.get('color_stability_test') else 'No',
                f"${estimated_fee:.2f}",
                f"${actual_fee:.2f}" if actual_fee is not None else '-'
            ])
        else:
            table_data.append([
                str(i),
                stone['sku'],
                f"${stone['value']:,.2f}",
                'Yes (+$50)' if stone.get('color_stability_test') else 'No',
                f"${estimated_fee:.2f}"
            ])

    if has_actual_fees:
        table_data.append(['', '', '', 'TOTAL:', f"${total_estimated:.2f}", f"${total_actual:.2f}"])
        col_widths = [0.4*inch, 1.5*inch, 1*inch, 0.8*inch, 0.9*inch, 0.9*inch]
    else:
        table_data.append(['', '', '', 'TOTAL:', f"${total_estimated:.2f}"])
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
    elements.append(Paragraph(f"<b>Amount Due: ${amount_due:.2f}</b>", header_style))
    elements.append(Paragraph(f"Payment is due upon collection of stones.", header_style))

    elements.append(Spacer(1, 0.5*inch))
    if branch:
        elements.append(Paragraph(f"Office: {branch['name']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))
        elements.append(Paragraph(f"{branch['address']}", ParagraphStyle('Footer', fontSize=9, textColor=colors.gray)))

    doc.build(elements)
    buffer.seek(0)

    try:
        filename = f"invoice_job_{job['job_number']}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        upload_result = cloudinary.uploader.upload(
            buffer,
            folder="invoices",
            public_id=filename,
            resource_type="raw"
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
    except Exception as e:
        logger.error(f"Failed to upload invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save invoice: {str(e)}")


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
