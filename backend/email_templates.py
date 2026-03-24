"""Email HTML template builders for notification system"""


def generate_stones_table_html(stones: list, include_fees: bool = False) -> str:
    """Generate HTML table for stones. Optionally include fees column."""
    rows = ""
    total_fee = 0
    for stone in stones:
        fee = stone.get('fee', 0)
        total_fee += fee
        fee_cell = f'<td style="padding: 12px; text-align: right;">${fee:,.2f}</td>' if include_fees else ''

        vf = stone.get('verbal_findings', {})
        cert_id = vf.get('certificate_id', '-') if isinstance(vf, dict) else '-'

        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 12px; text-align: center;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 12px; text-align: center;">{cert_id}</td>
            <td style="padding: 12px; text-align: right;">${stone.get('value', 0):,.2f}</td>
            {fee_cell}
        </tr>"""

    total_row = ""
    if include_fees:
        total_row = f"""
        <tr style="background-color: #f3f4f6; font-weight: bold;">
            <td colspan="5" style="padding: 12px; text-align: right;">Total Fee:</td>
            <td style="padding: 12px; text-align: right;">${total_fee:,.2f}</td>
        </tr>"""

    fee_header = '<th style="padding: 12px; text-align: right;">Fee</th>' if include_fees else ''

    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #141417; color: white;">
                <th style="padding: 12px; text-align: left;">SKU</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: center;">Weight</th>
                <th style="padding: 12px; text-align: center;">Cert. ID</th>
                <th style="padding: 12px; text-align: right;">Value</th>
                {fee_header}
            </tr>
        </thead>
        <tbody>{rows}{total_row}</tbody>
    </table>"""


def generate_verbal_results_table_html(stones: list, verbal_findings: list) -> str:
    """Generate HTML table for verbal results with full verbal data per stone"""
    rows = ""
    for stone in stones:
        vf = stone.get('verbal_findings', {})
        if not vf and verbal_findings:
            vf = next((v for v in verbal_findings if v.get("stone_id") == stone.get("id")), {})

        identification = vf.get('identification', '-') if vf else '-'
        color = vf.get('color', '-') if vf else '-'
        origin = vf.get('origin', '-') if vf else '-'
        treatment = vf.get('comment', '-') if vf else '-'
        cert_id = vf.get('certificate_id', '-') if vf else '-'

        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px; text-align: center;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 10px; text-align: center;">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 10px; text-align: center;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 10px; text-align: center;">{cert_id}</td>
            <td style="padding: 10px; text-align: center;">{identification}</td>
            <td style="padding: 10px; text-align: center;">{color}</td>
            <td style="padding: 10px; text-align: center;">{origin}</td>
            <td style="padding: 10px; text-align: center;">{treatment}</td>
        </tr>"""
    return f"""
    <table style="width: 100%; max-width: 900px; border-collapse: collapse; margin: 20px auto; font-size: 13px;">
        <thead>
            <tr style="background-color: #141417; color: white;">
                <th style="padding: 10px; text-align: center;">SKU</th>
                <th style="padding: 10px; text-align: center;">Type</th>
                <th style="padding: 10px; text-align: center;">Weight</th>
                <th style="padding: 10px; text-align: center;">Cert. ID</th>
                <th style="padding: 10px; text-align: center;">Identification</th>
                <th style="padding: 10px; text-align: center;">Color</th>
                <th style="padding: 10px; text-align: center;">Origin</th>
                <th style="padding: 10px; text-align: center;">Treatment</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""


def generate_cert_scans_table_html(stones: list) -> str:
    """Generate HTML table with certificate scan download links"""
    rows = ""
    for stone in stones:
        scan_url = stone.get('certificate_scan_url', '')
        if scan_url:
            link = f'<a href="{scan_url}" style="color: #2563eb; text-decoration: none;">Download Certificate</a>'
        else:
            link = '<span style="color: #6b7280;">Not available</span>'
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">{stone.get('sku', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('stone_type', 'N/A')}</td>
            <td style="padding: 12px; text-align: left;">{stone.get('weight', 0)} ct</td>
            <td style="padding: 12px; text-align: left;">{link}</td>
        </tr>"""
    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #141417; color: white;">
                <th style="padding: 12px; text-align: left;">SKU</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: left;">Weight</th>
                <th style="padding: 12px; text-align: left;">Certificate Scan</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""


def generate_fees_table_html(job: dict) -> str:
    """Generate HTML table for fees breakdown"""
    certificate_units = job.get('certificate_units', [])
    rows = ""
    for i, unit in enumerate(certificate_units, 1):
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; text-align: left;">Certificate Unit {i}</td>
            <td style="padding: 12px; text-align: left;">{unit.get('type', 'Standard')}</td>
            <td style="padding: 12px; text-align: right;">${unit.get('fee', 0):,.2f}</td>
        </tr>"""

    total_fee = job.get('total_fee', 0)
    rows += f"""
    <tr style="background-color: #f3f4f6; font-weight: bold;">
        <td colspan="2" style="padding: 12px; text-align: right;">Total Fee:</td>
        <td style="padding: 12px; text-align: right;">${total_fee:,.2f}</td>
    </tr>"""

    return f"""
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
            <tr style="background-color: #141417; color: white;">
                <th style="padding: 12px; text-align: left;">Item</th>
                <th style="padding: 12px; text-align: left;">Type</th>
                <th style="padding: 12px; text-align: right;">Fee</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>"""


def build_notification_email_html(notification_type: str, job: dict, client: dict, payment_url: str = "") -> tuple:
    """Build HTML email content for notification type. Returns (subject, html_body)"""
    job_number = job.get('job_number', 'N/A')
    client_name = client.get('name', 'Valued Customer')
    stones = job.get('stones', [])
    verbal_findings = job.get('verbal_findings', [])

    header = f"""
    <div style="background-color: #141417; padding: 20px; text-align: center;">
        <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">Bashari Lab-Direct</h1>
        <p style="color: white; margin: 5px 0 0 0; font-size: 14px;">Lab Logistics & ERP System</p>
    </div>
    """

    footer = f"""
    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated notification from Bashari Lab-Direct.</p>
        <p>If you have any questions, please contact us.</p>
    </div>
    """

    if notification_type == "stones_accepted":
        subject = f"Job #{job_number}: Stones Received - Bashari Lab-Direct"
        stones_table = generate_stones_table_html(stones, include_fees=True)

        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #141417; margin-bottom: 20px;">Stones Received</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">Your stones have been received and logged into our system.</p>
            
            <h3 style="color: #141417; margin-top: 30px;">Job Details</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Service Type:</strong> {job.get('service_type', 'Standard')}</p>
            <p><strong>Total Stones:</strong> {len(stones)}</p>
            
            <h3 style="color: #141417; margin-top: 30px;">Stones Received</h3>
            {stones_table}
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                <em>The signed Memo-In document is attached to this email.</em>
            </p>
        </div>
        """

    elif notification_type == "verbal_uploaded":
        subject = f"Job #{job_number}: Verbal Results Available - Bashari Lab-Direct"
        verbal_table = generate_verbal_results_table_html(stones, verbal_findings)

        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #141417; margin-bottom: 20px;">Verbal Results Available</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">The verbal findings for your stones are now available.</p>
            
            <h3 style="color: #141417; margin-top: 30px;">Job Details</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Total Stones:</strong> {len(stones)}</p>
            
            <h3 style="color: #141417; margin-top: 30px;">Verbal Results</h3>
            <div style="display: flex; justify-content: center;">
                {verbal_table}
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Please review the results above. Contact us if you have any questions.
            </p>
        </div>
        """

    elif notification_type == "stones_returned":
        subject = f"Job #{job_number}: Stones Ready for Collection - Bashari Lab-Direct"

        total_estimated = sum(s.get('fee', 0) for s in stones)
        total_actual = sum(s.get('actual_fee', s.get('fee', 0)) for s in stones)
        has_actual_fees = any(s.get('actual_fee') is not None for s in stones)

        fees_rows = ""
        for stone in stones:
            est_fee = stone.get('fee', 0)
            act_fee = stone.get('actual_fee')
            actual_cell = f'<td style="padding: 10px; text-align: right; font-weight: bold;">${act_fee:,.2f}</td>' if act_fee is not None else '<td style="padding: 10px; text-align: right; color: #6b7280;">-</td>'
            fees_rows += f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">{stone.get('sku', 'N/A')}</td>
                <td style="padding: 10px;">{stone.get('stone_type', 'N/A')}</td>
                <td style="padding: 10px; text-align: right;">${est_fee:,.2f}</td>
                {actual_cell}
            </tr>"""

        fees_rows += f"""
        <tr style="background-color: #f3f4f6; font-weight: bold;">
            <td colspan="2" style="padding: 10px; text-align: right;">TOTAL:</td>
            <td style="padding: 10px; text-align: right;">${total_estimated:,.2f}</td>
            <td style="padding: 10px; text-align: right;">${total_actual:,.2f}</td>
        </tr>"""

        fees_table = f"""
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <thead>
                <tr style="background-color: #141417; color: white;">
                    <th style="padding: 10px; text-align: left;">SKU</th>
                    <th style="padding: 10px; text-align: left;">Type</th>
                    <th style="padding: 10px; text-align: right;">Estimated Fee</th>
                    <th style="padding: 10px; text-align: right;">Actual Fee</th>
                </tr>
            </thead>
            <tbody>{fees_rows}</tbody>
        </table>
        """

        amount_due = total_actual if has_actual_fees else total_estimated

        pay_button_html = ""
        if payment_url:
            pay_button_html = f"""<div style="text-align: center; margin: 25px 0;">
                <a href="{payment_url}" style="background: #141417; color: #FFFFFF; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                    Pay Now
                </a>
                <p style="color: #6b7280; font-size: 13px; margin-top: 10px;">Click above to pay securely online (Credit Card / Bit)</p>
            </div>"""

        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #141417; margin-bottom: 20px;">Stones Ready for Collection</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">
                <strong>Your stones have returned to our Israel office and are ready for collection.</strong>
            </p>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="color: #92400e; margin: 0; font-weight: bold;">
                    Payment of ${amount_due:,.2f} is required upon pickup.
                </p>
            </div>
            
            {pay_button_html}
            
            <h3 style="color: #141417; margin-top: 30px;">Fee Summary</h3>
            {fees_table}
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                <em>The detailed invoice is attached to this email.</em>
            </p>
        </div>
        """

    elif notification_type == "cert_uploaded":
        subject = f"Job #{job_number}: Certificate Scans Available - Bashari Lab-Direct"
        scans_table = generate_cert_scans_table_html(stones)

        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #141417; margin-bottom: 20px;">Certificate Scans Available</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">
                The digital certificate scans for your stones are now available for download.
            </p>
            
            <h3 style="color: #141417; margin-top: 30px;">Certificate Downloads</h3>
            {scans_table}
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Click the download link next to each stone to view the certificate scan.
            </p>
        </div>
        """

    elif notification_type == "cert_returned":
        subject = f"Job #{job_number}: Physical Certificates Ready - Bashari Lab-Direct"

        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #141417; margin-bottom: 20px;">Physical Certificates Ready</h2>
            <p style="color: #374151; font-size: 16px;">Dear {client_name},</p>
            <p style="color: #374151; font-size: 16px;">
                <strong>Your physical certificates have arrived at our office and are ready for final collection.</strong>
            </p>
            
            <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
                <p style="color: #065f46; margin: 0;">
                    Please visit our office to collect your certificates along with your stones.
                </p>
            </div>
            
            <h3 style="color: #141417; margin-top: 30px;">Job Summary</h3>
            <p><strong>Job Number:</strong> #{job_number}</p>
            <p><strong>Total Stones:</strong> {len(stones)}</p>
            <p><strong>Total Certificates:</strong> {len([s for s in stones if s.get('certificate_scan_url')])}</p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                Thank you for choosing Bashari Lab-Direct for your gemstone certification needs.
            </p>
        </div>
        """
    else:
        subject = f"Job #{job_number}: Update - Bashari Lab-Direct"
        body = f"""
        <div style="padding: 30px;">
            <h2 style="color: #141417;">Job Update</h2>
            <p>Dear {client_name},</p>
            <p>Your job #{job_number} has been updated. Please log in to view details.</p>
        </div>
        """

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            {header}
            {body}
            {footer}
        </div>
    </body>
    </html>
    """

    return subject, html_body
