# Astteria (HK) Branding on HK → Israel Shipment Memos

Stones and certificates returned from Hong Kong to Israel are sent by Astteria (HK) Limited, not by Bashari. Their full shipment memo will carry Astteria's logo, name and contact details instead of Bashari's.

## Who it's for
- Super admins and branch admins who print the paperwork that travels with return shipments from the HK lab to Israel.

## Core features and experience
- **Sender identity follows the shipment direction**
  - **To-lab shipments (Israel → HK):** unchanged. They keep the Bashari logo, "Bashari Lab-Direct", "Eliyahu Bashari Diamonds LTD", the Bashari address and phones, and the VAT line.
  - **From-lab shipments (HK → Israel):** these are the "Stones from Lab" and "Certificates from Lab" types. Their full shipment memo uses the Astteria identity throughout.
- **Astteria header**
  - The layout matches today's Bashari header: the Astteria icon sits on the left, with "Astteria (HK) Limited" and the address next to it.
  - Address: Room 4B, 16/F, Cheong K. Building, No. 84-86 Des Voeux Road Central, Hong Kong.
- **Astteria footer**
  - The bottom contact block shows Astteria's name and address, Tel +852 2526 7780 and grs-il@bashds.com.
  - The Bashari VAT number is removed, and no VAT line is shown for Astteria.
- **Applies to every version of the full memo:** the Precious, Semi-Precious and Both prints from the Print menu all switch to Astteria.
- **Not changed:**
  - Per-job memos printed from a shipment keep the Bashari identity.
  - The rest of the full memo stays as it is today: the "Shipment Memo Return – …" titles, the shipment details, the From/To addresses, the stones list, the totals and the Sender/Courier signature lines.
- **Editable in Settings**
  - A new "Return Shipment Sender (HK)" section holds the company name, address, phone, email and logo.
  - It starts pre-filled with the details above and the Astteria icon you sent.
  - The logo can be replaced by uploading a new image. Changes apply to the next memo printed, including for existing shipments.

## User flow
1. (Optional) The admin opens Settings → Return Shipment Sender (HK) and checks the pre-filled Astteria details and logo.
2. The admin opens an HK → Israel shipment ("Stones from Lab" or "Certificates from Lab") and clicks Print PDF, then picks Precious, Semi-Precious or Both.
3. The memo prints with the Astteria icon, name and address at the top and the Astteria contact details at the bottom.
4. Israel → HK shipments print exactly as they do today, with Bashari.

## UI/UX feel
- The memo keeps its current clean black-and-white document style. Only the logo and the text details change, so both senders' memos look like the same family of documents.
- The Astteria icon is shown at the same size and framing as the Bashari logo, and prints clearly in black and white.
- The Settings section is a simple form, matching the other Settings cards: text fields, a logo preview and an upload button.

## Implementation phases
- **Phase 1 (MVP, built now)**
  - Astteria identity on the full shipment memo for from-lab shipments (header and footer), covering Precious, Semi-Precious and Both
  - Settings section to edit the name, address, phone, email and logo, pre-filled with the Astteria details
- **Phase 2**
  - Optional switch to apply the Astteria identity to per-job memos printed from HK → Israel shipments
  - Optional fields for an Astteria registration number or VAT line on the footer
- **Phase 3**
  - Sender identity chosen per shipment, or per origin address, for future branches or partner companies beyond HK
  - The same sender identity on emailed PDF attachments for return shipments

## Assumptions
- "HK → Israel" means any shipment of type "Stones from Lab" or "Certificates from Lab". The shipment's From/To addresses are not checked.
- The header uses the icon-only Astteria mark, not the stacked icon + "ASTTERIA" wordmark, with the company name written as text beside it.
- There is no second line under the company name in the Astteria header (Bashari's header has "Eliyahu Bashari Diamonds LTD" there). The address takes that spot instead.
- The email shown for Astteria is grs-il@bashds.com, as provided.
- The From/To blocks in the shipment details still show the stored shipment addresses, unchanged.
- The browser tab and print-file name for these memos read "Shipment #N — Astteria (HK) Limited" instead of "— Bashari Lab-Direct".
- Only super admins can edit the Return Shipment Sender settings, consistent with other company-level settings.
