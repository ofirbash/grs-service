# GRS Global - Lab Logistics & ERP System

## Product Requirements Document (PRD)

### Overview
GRS Global is a laboratory logistics and ERP application for gemstone testing, built for Bashari. It's a desktop-first responsive web application inspired by the design of GRS GemResearch Swisslab (gemresearch.ch).

### Tech Stack
- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Python FastAPI, Pydantic models
- **Database**: MongoDB
- **Authentication**: JWT with optional 2FA

### Core Entities
1. **User** - Super Admin, Branch Admin, Customer roles
2. **Branch** - Office locations (e.g., Israel, USA)
3. **Client** - Customer profiles linked to branches
4. **Job** - Work orders containing stones for testing
5. **Stone** - Individual gemstones with SKU, weight, type, value
6. **Shipment** - Container for jobs being shipped to/from labs

### User Roles
- **Super Admin**: Full access to all branches and features
- **Branch Admin**: Access limited to their branch
- **Customer**: Can view their own jobs and status

---

## What's Been Implemented

### Session: Feb 22, 2026 - Codebase Restoration & Verification
- ✅ Pulled codebase from GitHub (ofirbash/grs-service)
- ✅ Fixed TypeScript lint errors in jobs, shipments, stones, settings pages
- ✅ Fixed shadcn/ui component interface errors (input.tsx, textarea.tsx, dialog.tsx)
- ✅ Built Next.js production build successfully
- ✅ Configured environment files (.env for frontend and backend)
- ✅ Seeded test data (admin user, branches, client, job with stones)
- ✅ Initialized dropdown settings for verbal findings
- ✅ All services running (backend, frontend, MongoDB)
- ✅ **Full E2E testing passed: 100% success rate**

### Session: Feb 22, 2026 - Feature Enhancements (v2)
**Client Enhancements:**
- ✅ Added Edit functionality for existing clients (PUT /api/clients/{id})
- ✅ Added Secondary Email field to client profiles
- ✅ Added Secondary Phone field to client profiles
- ✅ Added Notes field for client remarks
- ✅ Reorganized form into compact 2-column grid layout:
  - Row 1: Name | Company
  - Row 2: Primary Email | Primary Phone  
  - Row 3: Secondary Email | Secondary Phone
  - Row 4: Branch | Address
  - Row 5: Notes (full width)
- ✅ Dialog made wider (max-w-2xl) and scrollable

**Stone Verbal Findings Improvements:**
- ✅ Certificate ID now mandatory with red asterisk (*) indicator
- ✅ "Required field" validation message shown under empty Certificate ID
- ✅ Verbal findings form locks after saving (view mode with disabled/greyed inputs)
- ✅ "Completed" badge (green) appears next to Verbal Findings header when saved
- ✅ "Edit" button appears next to Completed badge to unlock form
- ✅ SearchableSelect component updated with disabled state support

**Job Stone Grouping Improvements:**
- ✅ Already grouped stones show "Ungroup X Stones" button (red styling)
- ✅ Ungrouped stones show "Group X Stones for Certificate" button
- ✅ Fixed blinking header on grouped stones (added hover:bg-navy-800 to prevent flickering)
- ✅ Added PUT /api/jobs/{job_id}/ungroup-stones endpoint

### Phase 1: Frontend Rebuild (Complete) - Feb 19, 2026
- ✅ Removed Expo/React Native frontend (rejected by user)
- ✅ Created new Next.js 14 project with App Router
- ✅ Integrated Tailwind CSS with GRS-inspired color scheme (navy blue, gold accents)
- ✅ Built shadcn/ui component library
- ✅ Login page with JWT authentication
- ✅ Dashboard layout with collapsible sidebar
- ✅ Dashboard page with stats cards (Jobs, Clients, Value, Fees)
- ✅ Recent Shipments and Recent Jobs sections
- ✅ Jobs by Status breakdown

### Phase 2: Core Features (Complete) - Feb 19, 2026
- ✅ **Shipments Page**
  - List all shipments with filtering
  - Create Shipment dialog with job selection
  - View shipment details
  - Update shipment status (pending → in_transit → delivered)
  - Add jobs to shipment after creation
  - Print shipment PDF
- ✅ **Jobs Page** (Fully Tested)
  - Wide data table with all job info
  - Create Job dialog with stone entry
  - Clickable job rows to view details
  - **Edit Job** - Update status and notes
  - **Print Job** - Generate printable job details with certificate groupings
  - **Upload Signed Memo** - Attach signed documents to jobs
  - **Group Stones for Certificate** - Group up to 30 stones for single certificate
  - **Visual Certificate Organization** - Stones displayed grouped by certificate with:
    - Certificate Summary (e.g., "Cert 1: 2 stones (Pair), Cert 2: 6 stones (Layout)")
    - Color-coded certificate headers
    - Group totals per certificate
    - Support for multiple groups per job (pairs, singles, layouts)
- ✅ **Clients Page**
  - Client list with branch filtering
  - Add Client dialog
- ✅ **Settings Page**
  - Profile information
  - Security settings (2FA placeholder)
  - System information

### Phase 3: Bug Fixes (Complete) - Feb 19, 2026
- ✅ Fixed SKU generation bug: weights with trailing zeros (e.g., 2.50 → "250" instead of "25")
- ✅ Added "received" status to valid job statuses list
- ✅ Fixed StoneResponse model to include certificate_group field

### Phase 7: Admin Settings Page (Complete) - Feb 23, 2026
- ✅ **Multi-Tab Settings Page**
  - Tab 1: Verbal Dropdowns - Manage dropdown options (Identification, Color, Origin, Comment) with stone type filtering
  - Tab 2: Branches - CRUD for office locations with address, return address, phone, email
  - Tab 3: Pricing - Configure service fees and value brackets
- ✅ **Verbal Dropdowns Tab Features**
  - Field selector dropdown to switch between Identification, Color, Origin, Comment
  - **Search/filter input** - instant filtering of options as you type
  - Table of options with Value and Stone Types columns
  - Add/Edit/Delete options with inline editing
  - Stone type badges with click-to-toggle filtering (all, Emerald, Sapphire, Ruby, etc.)
  - Shows filtered count vs total count when searching
- ✅ **Branches Tab Features**
  - Table displaying all branches with Name, Code, Address, Return Address, Contact
  - Add Branch dialog with all required fields
  - Edit Branch button for each row
  - Super Admin only can add/edit branches
- ✅ **Pricing Tab Features**
  - Color Stability Test Fee display and editing
  - Value Brackets table with Min/Max Value, Express/Normal/Recheck fees
  - Edit Pricing mode with editable inputs
  - Add/Remove bracket functionality
  - Available Service Types display

### Phase 4: UX Enhancements (Complete) - Feb 21, 2026
- ✅ **Stacked/Nested Modals Feature**
  - Click job in Shipment details → Job dialog opens on top
  - Click stone in Job dialog → Stone dialog opens on top
  - 3-level stacking: Shipment → Job → Stone (all layers visible)
  - Works from both Jobs page and Shipments page
- ✅ **Stone Dialog Features**
  - Displays stone details (type, weight, shape, value, fee, certificate group)
  - Verbal findings textarea with save functionality
  - Certificate scan upload button
  - Group warning for grouped stones (scan applies to all in group)

### Phase 5: Structured Verbal Findings (Complete) - Feb 22, 2026
- ✅ **Verbal Findings Form**
  - Certificate ID (text input)
  - Weight (number input, pre-filled with stone weight, editable)
  - Identification (dropdown from configurable settings)
  - Color (dropdown from configurable settings)
  - Origin (dropdown from configurable settings)
  - Comment (dropdown from configurable settings)
- ✅ **Search in Dropdowns**
  - All 4 dropdown fields (Identification, Color, Origin, Comment) have search/filter boxes
  - Instant filtering as you type
- ✅ **Dropdown Settings System**
  - Backend API: GET/PUT/POST /api/settings/dropdowns
  - All dropdown values stored in MongoDB
  - Global values (applicable to all stone types)
  - Prepared for future: stone-type-specific filtering
- ✅ **Default Values Loaded from PDFs**
  - 35+ identification values (NATURAL RUBY, NATURAL SAPPHIRE, etc.)
  - 35+ color values (VIVID RED PIGEON BLOOD, VIVID BLUE ROYAL BLUE, etc.)
  - 19 origin values (BURMA, SRI LANKA, KASHMIR, COLOMBIA, etc.)
  - 22 comment values (HEATED, H(a), H(b), NO INDICATION OF TREATMENT, etc.)
- ✅ **Updated ALL Pages with New Verbal Findings Form**
  - Jobs page stone dialog: structured form with search
  - Shipments page nested stone dialog: structured form with search
  - Stones page stone details: structured form with search
- ✅ **Fixed Nested Job Modal in Shipments**
  - Now matches full job modal design
  - Shows certificate grouping
  - "Open in New Tab" button to view in Jobs page
  - **Memo upload functionality** added to nested job modal

### Phase 6: UI/UX Bug Fixes (Complete) - Feb 22, 2026
- ✅ **Stone Modal Height Fix**
  - Modal uses flex layout with fixed header/footer and scrollable content
  - Close button always visible regardless of content height
  - Dropdown menus detect available space and position up/down accordingly
- ✅ **Nested Job Modal Context Preservation**
  - Full job details modal opens on top of shipment modal
  - Memo upload functionality works in nested context
  - 3-level stacking supported: Shipment → Job → Stone
- ✅ **SearchableSelect Dropdown Positioning**
  - Dropdowns detect viewport boundaries
  - Opens upward when near bottom of viewport
  - Increased z-index for proper layering in modals
- ✅ **Nested Job Modal Full Features**
  - Print button opens print-friendly popup with full job details
  - Edit button shows edit form (status dropdown, notes textarea)
  - Memo upload works correctly with file input
- ✅ **Group Certificate Scan Route Fix**
  - Fixed FastAPI route ordering issue
  - `/stones/group/certificate-scan` defined before `/stones/{stone_id}/certificate-scan`
  - Both endpoints work correctly now

### Phase 10: 5-Stage Email Notification System (Complete) - Feb 24, 2026
- ✅ **Resend Integration**
  - Added Resend API key to backend .env
  - Email sending via Resend API with HTML templates
  - Attachment support for PDF files (Memo-In, Invoice)
- ✅ **5 Notification Types**
  1. `stones_accepted` - Stones Received confirmation with stones table and fees
  2. `verbal_uploaded` - Lab findings with verbal results table
  3. `stones_returned` - Notice that stones are ready for collection
  4. `cert_uploaded` - Digital certificate scans available with download links
  5. `cert_returned` - Physical certificates ready for final collection
- ✅ **Backend API Endpoints**
  - GET `/api/jobs/{job_id}/notifications/status` - Returns available notifications based on job status
  - GET `/api/jobs/{job_id}/notifications/preview/{type}` - Preview email content (subject, HTML body, recipient)
  - POST `/api/jobs/{job_id}/notifications/send/{type}` - Send email via Resend
- ✅ **Frontend "Review & Send" Workflow**
  - Email Notifications section in Job detail modal (admin only)
  - Shows available notifications based on job status
  - "Review" button to preview email content
  - Email preview modal with recipient info, subject, and rendered HTML
  - "Send Email" button to send after review
  - Sent notifications shown with green checkmark and timestamp
- ✅ **Email Templates**
  - Professional GRS Global branded header
  - Dynamic data tables (stones, fees, verbal results, certificate links)
  - Personalized greeting with client name
  - Attachment indicators for PDF files

### Backend (Previously Complete)
- ✅ Full CRUD APIs for all entities
- ✅ Shipment workflow with job linking
- ✅ Auto-SKU generation for stones (FIXED)
- ✅ PDF generation (Memo-in, Invoice, Shipment docs)
- ✅ Dashboard stats API
- ✅ Notification system (MOCKED - no Twilio/SMTP)
- ✅ Stone grouping for certificates API
- ✅ Memo upload API
- ✅ **Cloudinary Integration** (Feb 23, 2026)
  - GET /api/cloudinary/signature - Generate secure upload signatures
  - POST /api/cloudinary/delete - Delete files from Cloudinary
  - Files stored in Cloudinary folders: certificates/, memos/, uploads/
  - Backward compatible - legacy base64 URLs still display correctly

### Phase 8: Cloud File Storage - Cloudinary (Complete) - Feb 23, 2026
- ✅ **Backend Cloudinary Endpoints**
  - Signature generation endpoint for secure direct uploads
  - Delete endpoint for file removal
  - Folder validation (certificates/, memos/, uploads/, invoices/)
- ✅ **Frontend Cloudinary Integration**
  - cloudinaryApi in api.ts with uploadFile() and deleteFile() functions
  - Direct upload to Cloudinary (bypasses server for file data)
  - URL saved to backend after successful upload
- ✅ **Updated Pages**
  - Jobs page: Memo upload now uses Cloudinary
  - Jobs page: Certificate scan upload now uses Cloudinary
  - Jobs page: Lab Invoice upload (admin only) - NEW
  - Stones page: Certificate scan upload now uses Cloudinary
  - Shipments page: Memo and certificate scan uploads use Cloudinary
- ✅ **Display Support**
  - PDF detection for both base64 prefix and .pdf extension
  - Images display from Cloudinary URLs
  - Backward compatible with legacy base64 data
- ✅ **Lab Invoice Feature (Admin Only)**
  - New field: lab_invoice_url, lab_invoice_filename on Job model
  - Upload/View buttons in Job details dialog
  - Marked as "Admin Only" with warning "not visible to customers"
  - Stored in Cloudinary invoices/ folder

### Phase 9: Customer Role & Access Control (Complete) - Feb 23, 2026
- ✅ **Customer Role Implementation**
  - Added `customer` role alongside `super_admin` and `branch_admin`
  - Customer accounts linked to a specific client via `client_id`
  - Test account: `customer@test.com` / `customer123`
- ✅ **Backend Access Control**
  - Jobs, Stones, Shipments endpoints filter by `client_id` for customer role
  - Clients page restricted to admin only
  - Settings page restricted to admin only
  - Dashboard stats filtered for customer role
- ✅ **Frontend Navigation Restrictions**
  - Customer sidebar shows: Dashboard, Jobs, Stones only
  - Admin sidebar shows all options including Clients and Settings
- ✅ **Verbal Findings Access Control**
  - Customers can VIEW verbal findings but cannot EDIT
  - Edit button hidden from customers (both Jobs and Stones pages)
  - Save button hidden from customers
  - All form fields disabled for customers
  - Certificate Scan upload button hidden from customers
- ✅ **Dashboard Job Navigation**
  - Recent Jobs in dashboard are clickable
  - Click navigates to `/dashboard/jobs?jobId={id}` with modal auto-open
  - Works for both admin and customer roles

### Phase 11: UI/UX Refinements - Unified Edit Mode (Complete) - Feb 24, 2026
- ✅ **Email Notification Refresh**: Notifications refresh immediately after job status change without closing/reopening the modal
- ✅ **Actual Fee Display in Stones List**: Job modal stone table shows "Actual: $XXX" for stones with fees differing from estimated
- ✅ **Unified Edit Mode (Jobs Page)**: Stone detail dialog opens locked; single "Edit" button enables all fields (verbal findings + actual fee + color stability); single "Save Changes" saves everything
- ✅ **Unified Edit Mode (Stones Page)**: Same unified edit behavior with combined save for verbal findings and fees
- ✅ **Null Actual Fee Bug Fix**: Fixed crash when stones had null actual_fee values (changed `!== undefined` to `!= null`)
- ✅ **Lock Indicator**: Shows "Click Edit to modify fees and verbal findings" when fields are locked on both pages
- ✅ **Removed Redundant Edit Buttons**: Cleaned up duplicate edit buttons in verbal findings section headers

### Phase 12: Dynamic Service Types & Pricing (Complete) - Feb 24, 2026
- ✅ **Add Service Types from Settings**: Admins can add new service types from the Pricing tab in Settings (input + Add button in edit mode)
- ✅ **Dynamic Pricing Columns**: Each service type gets its own fee column in the pricing brackets table
- ✅ **Dynamic Fee Calculation**: Backend calculates fees using the service type's fee from DB brackets (not hardcoded)
- ✅ **Backward Compatibility**: Old bracket format (express_fee/normal_fee/recheck_fee) auto-converts to new `fees` dict format
- ✅ **Dynamic Service Types in Jobs**: Jobs page fetches service types from pricing config instead of hardcoded list
- ✅ **No Deletion**: Service types cannot be removed (protects existing jobs)
- ✅ **Duplicate Prevention**: Cannot add a service type that already exists (case-insensitive check)

### Phase 13: Client Account Self-Setup (Complete) - Feb 24, 2026
- ✅ **Auto-create customer user account**: When admin creates a client, a customer user account is auto-created with a setup token (30-day expiry)
- ✅ **Welcome email via Resend**: Setup email sent to client's primary email with branded HTML and "Set Up Your Password" link
- ✅ **Setup password page** (`/setup-password?token=xxx`): Clean password form, validates token, sets password, auto-logs in
- ✅ **Token expiry**: 30-day expiry enforced server-side
- ✅ **Duplicate handling**: Skips user creation if email already exists in users collection

### Phase 14: Branch-First Architecture (Complete) - Feb 24, 2026
- ✅ **Admin accounts created**: ofir1@bashds.com (IL branch_admin), ofir2@bashds.com (US branch_admin), ofir@bashds.com (super_admin)
- ✅ **Branch isolation enforced**: Clients, Jobs, Stones, Shipments, Dashboard all scoped by branch for branch_admins
- ✅ **Super-admin branch toggle**: Dropdown in top bar to switch between "All Branches", "Israel", "USA-NY"
- ✅ **Branch filter persisted**: Selected branch stored in Zustand with localStorage persistence
- ✅ **All pages updated**: Dashboard, Jobs, Stones, Clients, Shipments all respect branch filter
- ✅ **Shipment filtering via jobs**: Since shipments don't have branch_id, filtered via their job associations
- ✅ **85 legacy clients imported** from SQL file (all assigned to Israel branch)

### Phase 15: Admin User Management (Complete) - Feb 24, 2026
- ✅ **Admin Users tab** in Settings (visible only to super_admin)
- ✅ **List admin users**: Shows all super_admin and branch_admin accounts with name, email, role, branch
- ✅ **Create admin user**: Dialog with name, email, password, access level (Super Admin / Branch Admin), branch selector, phone
- ✅ **Edit admin user**: Update name, role, branch, phone, and optionally reset password
- ✅ **Backend endpoints**: `GET /api/users`, `POST /api/users/admin`, `PUT /api/users/{id}`

### Phase 16: Payment Gateway - Tranzilla (Complete) - Mar 2026
- ✅ **Public payment page** (`/pay?token=xxx`): No login required, shows job details, stone fees, currency selector
- ✅ **Currency selection**: USD or ILS with live exchange rate from exchangerate-api.com
- ✅ **Tranzilla iframe integration**: Ready to activate with terminal credentials (TRANZILLA_TERMINAL env var)
- ✅ **Test/simulate mode**: Works without Tranzilla credentials for development
- ✅ **Payment notify endpoint**: Receives Tranzilla POST callback, records payment status on job
- ✅ **Payment link in email**: "Stones Ready" notification email includes "Pay Now" button linking to payment page
- ✅ **Payment status tracking**: Jobs track payment_status, payment_date, payment_transaction_id, payment_currency, payment_amount

---

## Prioritized Backlog

### P0 - Critical
- None currently

### P1 - High Priority
- [ ] SMS notifications (Twilio integration)
- [ ] Domain verification for Resend email (production use)
- [ ] Legacy data migration from CSV/database

### P2 - Medium Priority
- [x] Verbal findings entry and display (Implemented in Stone Dialog)
- [x] Document upload for certificate scans (Implemented in Stone Dialog)
- [x] Cloud storage for uploaded files (Cloudinary integration - Feb 23, 2026)
- [x] Email notifications with Resend (Feb 24, 2026)
- [ ] Backend refactoring (split server.py into modular routers)
- [ ] Frontend refactoring (decompose large page components)

### P3 - Low Priority / Future
- [ ] Mobile responsive improvements
- [ ] Two-Factor Authentication setup flow
- [ ] Bulk job import
- [ ] Reporting and analytics dashboard
- [ ] Client portal for tracking

---

## API Endpoints

### Authentication
- POST `/api/auth/login` - Login with email/password
- POST `/api/auth/register` - Register new user
- GET `/api/auth/me` - Get current user info

### Shipments
- GET `/api/shipments` - List all shipments
- POST `/api/shipments` - Create new shipment
- GET `/api/shipments/{id}` - Get shipment details
- PUT `/api/shipments/{id}` - Update shipment
- PUT `/api/shipments/{id}/status` - Update status with cascade
- PUT `/api/shipments/{id}/jobs` - Update jobs in shipment
- DELETE `/api/shipments/{id}` - Delete shipment
- GET `/api/shipments/config/options` - Get dropdown options

### Jobs
- GET `/api/jobs` - List all jobs
- POST `/api/jobs` - Create new job
- GET `/api/jobs/{id}` - Get job details
- PUT `/api/jobs/{id}` - Update job (notes, status)
- PUT `/api/jobs/{id}/status` - Update job status
- PUT `/api/jobs/{id}/group-stones` - Group stones for certificate
- PUT `/api/jobs/{id}/memo` - Upload signed memo

### Notifications (Email)
- GET `/api/jobs/{job_id}/notifications/status` - Get notification status for a job
- GET `/api/jobs/{job_id}/notifications/preview/{type}` - Preview email content
- POST `/api/jobs/{job_id}/notifications/send/{type}` - Send email via Resend

### Clients
- GET `/api/clients` - List all clients
- POST `/api/clients` - Create new client
- GET `/api/clients/{id}` - Get client details

### Branches
- GET `/api/branches` - List all branches
- POST `/api/branches` - Create new branch

### Dashboard
- GET `/api/dashboard/stats` - Get dashboard statistics

---

## Test Credentials
- **Email**: admin@bashari.com
- **Password**: admin123
- **Role**: super_admin

---

## File Structure

```
/app
├── backend/
│   ├── server.py              # Slim FastAPI app (103 lines)
│   ├── database.py            # MongoDB connection
│   ├── auth.py                # JWT, password hashing, auth deps
│   ├── models.py              # All Pydantic models
│   ├── pricing.py             # Pricing engine + constants
│   ├── utils.py               # SKU generation, helpers
│   ├── email_templates.py     # Email HTML template builders
│   ├── routes/
│   │   ├── auth_routes.py     # Auth (login, register, 2FA, setup-password)
│   │   ├── branches.py        # Branch CRUD
│   │   ├── clients.py         # Client CRUD + auto-setup email
│   │   ├── jobs.py            # Job CRUD + stone management
│   │   ├── stones.py          # Stone endpoints (verbal, fees, cert scans)
│   │   ├── shipments.py       # Shipment CRUD + status cascade
│   │   ├── notifications.py   # Email notification preview/send/status
│   │   ├── settings.py        # Dropdown settings
│   │   ├── cloudinary_routes.py # Cloudinary signature/delete
│   │   ├── pdf.py             # PDF generation (memo-in, invoice, shipment)
│   │   ├── pricing_routes.py  # Pricing config endpoints
│   │   ├── users.py           # Admin user management
│   │   ├── dashboard.py       # Dashboard stats
│   │   ├── payments.py        # Payment gateway endpoints
│   │   ├── addresses.py       # Address CRUD
│   │   └── documents.py       # Document upload
│   ├── tests/
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx          # Root layout
    │   │   ├── page.tsx            # Login page
    │   │   ├── setup-password/     # Customer password setup
    │   │   ├── pay/                # Payment page (public)
    │   │   └── (dashboard)/
    │   │       ├── layout.tsx      # Dashboard layout with sidebar
    │   │       └── dashboard/
    │   │           ├── page.tsx           # Main dashboard
    │   │           ├── jobs/page.tsx      # Jobs management
    │   │           ├── stones/page.tsx    # Stones management
    │   │           ├── shipments/page.tsx # Shipments management
    │   │           ├── clients/page.tsx   # Clients management
    │   │           └── settings/page.tsx  # Settings
    │   ├── components/ui/          # shadcn/ui components
    │   └── lib/
    │       ├── api.ts              # Axios API client
    │       ├── store.ts            # Zustand state management
    │       └── utils.ts            # Utility functions
    ├── .env
    ├── package.json
    └── tailwind.config.ts
```

---

## Design System
- **Primary Color**: Navy (#102a43)
- **Accent Color**: Gold (#fbbf24)
- **Font**: Inter (system font stack)
- **Components**: shadcn/ui with custom styling
- **Layout**: Desktop-first with collapsible sidebar

---

### Session: Mar 24, 2026 - Backend Refactoring
**Refactored monolithic server.py (3,815 lines) into modular architecture:**
- ✅ `server.py` → 103 lines (slim app setup + router imports)
- ✅ `database.py` → MongoDB connection module
- ✅ `auth.py` → JWT, password hashing, auth dependencies
- ✅ `models.py` → All Pydantic models (410 lines)
- ✅ `pricing.py` → Pricing engine + constants
- ✅ `utils.py` → SKU generation, stone type codes, logo download
- ✅ `email_templates.py` → Email HTML template builders (379 lines)
- ✅ 16 route files in `routes/` directory
- ✅ **24/24 backend API tests passed (iteration_17)**
- ✅ **All frontend pages verified working**

### Session: Mar 24, 2026 - Tranzila Payment Gateway Integration
**Integrated Tranzila payment gateway with live API:**
- ✅ Handshake flow: Backend calls `api.tranzila.com` to get secure `thtk` token
- ✅ Iframe payment: Frontend embeds Tranzila's `iframenew.php` for PCI-compliant CC processing
- ✅ BIT wallet payment support (`bit_pay=1` parameter)
- ✅ Currency selector: USD or ILS with live exchange rate
- ✅ Notify endpoint: Receives POST callbacks from Tranzila after payment
- ✅ Payment status polling: Frontend polls every 5s during iframe interaction
- ✅ Payment simulation: Test mode for when Tranzila is not configured
- ✅ Branding: Bashari colors, no Tranzila logo, custom button labels
- ✅ **12/12 backend payment API tests passed (iteration_18)**
- Terminal: `grsil`, credentials stored in `.env`

---

## Known Issues
1. **Platform Preview Bug**: The Emergent platform "Preview" button shows an Expo QR code. Workaround: Use direct URL to access the app.
2. **Resend Email Limitation**: Free tier Resend accounts with default sender (onboarding@resend.dev) can only send emails to the account owner's email. Domain verification required at resend.com/domains for production use.

---

## Testing Status
- Backend: 100% (all API tests passed)
- Frontend: 100% (all test flows completed)
- Test reports: 
  - `/app/test_reports/iteration_2.json` - Jobs page features
  - `/app/test_reports/iteration_3.json` - Stacked modals feature
  - `/app/test_reports/iteration_4.json` - Structured verbal findings & nested job modal
  - `/app/test_reports/iteration_5.json` - UI/UX bug fixes (Feb 22, 2026)
  - `/app/test_reports/iteration_6.json` - Nested job modal full features & group cert scan fix (Feb 22, 2026)
  - `/app/test_reports/iteration_7.json` - Memo upload bug fix (Feb 22, 2026)
  - `/app/test_reports/iteration_11.json` - Admin Settings page (Feb 23, 2026)
  - `/app/test_reports/iteration_12.json` - Cloudinary integration (Feb 23, 2026)
  - `/app/test_reports/iteration_13.json` - Customer access control & dashboard navigation (Feb 23, 2026)
  - `/app/test_reports/iteration_15.json` - 5-Stage Email Notification System (Feb 24, 2026)
  - `/app/test_reports/iteration_16.json` - UI/UX fixes: unified edit mode, notification refresh, actual fees (Feb 24, 2026)
  - `/app/test_reports/iteration_17.json` - Backend refactoring validation: 24/24 API tests passed, all frontend pages verified (Mar 24, 2026)
  - `/app/test_reports/iteration_18.json` - Tranzila payment gateway: 12/12 payment API tests passed (Mar 24, 2026)
  - `/app/test_reports/iteration_19.json` - Mounted fee feature: 7/7 backend + all frontend flows passed (Apr 14, 2026)
  - `/app/test_reports/iteration_20.json` - Comprehensive full system test: 39/39 backend + all frontend flows passed (Apr 14, 2026)

### Session: Apr 14, 2026 - Mounted Fee & Color Stability Fix
- ✅ Completed "mounted" toggle for stones (marks stone as jewellery-mounted, adds configurable fee)
- ✅ Mounted fee only charged once per certificate group (backend logic in /app/backend/routes/stones.py)
- ✅ Added `mounted` field to Stone interfaces in both jobs/page.tsx and stones/page.tsx
- ✅ Added `mounted` to stonesApi.updateFees type signature in api.ts
- ✅ Added mounted toggle UI (Switch) to stone detail dialog on Jobs page
- ✅ Added mounted toggle UI (Switch) to stone detail dialog on Stones page
- ✅ Save handler in both pages sends mounted state to backend and refreshes data after save
- ✅ Fixed StoneResponse model missing `mounted` field (bug found by testing agent)
- ✅ Fixed duplicate junk code at end of jobs/page.tsx from previous session
- ✅ Color stability test fee toggle working correctly ($50 add/remove)
- ✅ total_fee updates dynamically after toggling mounted or color stability test

### Session: Apr 14, 2026 - Mounted Group Propagation
- ✅ Updated mounted toggle to propagate to ALL stones in the same certificate group
- ✅ Mounting any stone in a group marks all group stones as mounted (fee added once)
- ✅ Unmounting any stone in a group marks all group stones as unmounted (fee removed once)
- ✅ Color stability test remains per-stone (independent of group)

### Session: Apr 14, 2026 - Job Detail Dialog Layout Rearrangement
- ✅ Restructured job detail dialog from single-column to 2-column layout on desktop (lg breakpoint)
- ✅ Left column: Stones table (primary content, now visible immediately)
- ✅ Right sidebar (280px): Action cards (Signed Memo, Client Invoice, Payment, Lab Invoice, Notifications)
- ✅ Dialog widened from max-w-4xl to max-w-5xl to accommodate 2-column layout
- ✅ Action sections converted to compact bordered cards with smaller buttons/text
- ✅ Mobile layout preserved: single column with stones first, then actions stacked below
- ✅ No mobile breakage verified on 390px viewport

### Session: Apr 14, 2026 - Payment Link UX + Stone Dialog UX
- ✅ Payment link: added "Open" button (opens in new tab) alongside "Copy Link"
- ✅ Stone dialog: Save button moved to sticky footer (always visible without scrolling)
- ✅ Stone dialog: Unsaved changes confirmation when closing in edit mode ("Discard" / "Save & Close")
- ✅ Extracted stone save handler into named `handleSaveStone` function for reuse

### Session: Apr 14, 2026 - Adjustment Payments & Job Discount
- ✅ Adjustment payment: when job is paid, admin can create an adjustment payment with manual amount
- ✅ Adjustment payment page shows notice: "This is an adjustment payment..."
- ✅ Backend stores `payment_adjustment` and `payment_adjustment_amount` flags on job
- ✅ Job-level discount: admin can set a discount in edit mode (e.g., $100 deducted from total)
- ✅ Net Total shown when discount is active (Total Fees - Discount)
- ✅ Discount applied in payment calculation (deducted from total before charging)
- ✅ Discount NOT applied to adjustment payments (manual amount only)
- ✅ Payment page shows discount info when applicable

### Session: Apr 20, 2026 - SMS Notifications (SMS4Free Integration)
- ✅ SMS4Free API integrated (`/app/backend/sms.py`) with send and balance check
- ✅ SMS notification endpoints: preview (`GET /jobs/{id}/sms/preview/{type}`), send (`POST /jobs/{id}/sms/send/{type}`), balance (`GET /sms/balance`)
- ✅ 5 SMS message templates (per status): stones_accepted, verbal_uploaded, stones_returned, cert_uploaded, cert_returned
- ✅ Messages include job details, fee summary, and login link for customer portal
- ✅ SMS send logged in job's `notification_log` with channel=sms
- ✅ Frontend: Email + SMS buttons side by side in notification section
- ✅ SMS balance: 9 messages available (free tier — sender must be phone number; after purchasing package, sender can be changed to BASHARI-LAB)
- ✅ Successfully sent test SMS to client phone number

### Session: Apr 20, 2026 - Fee Display Fixes
- ✅ Fixed: Color stability fee shows actual amount from DB (e.g., "+$30") instead of hardcoded "+$50"
- ✅ Fixed: Mounted fee shows "Yes (+$50)" format (same as color stability)
- ✅ Fixed: Stone `fee` field now includes mounted fee (was only in job total before)
- ✅ Fixed: Job `total_fee` recalculated from stone fees (grouped mounted counted once per group)
- ✅ Fixed: Backend recalculates total from stone fees instead of incremental `$inc`
- ✅ Migrated existing data: all mounted stones' fees updated to include mounted fee
- ✅ Dynamic fee amounts fetched from pricing config on both Jobs and Stones pages

---

## Test Credentials
- **Admin Email**: admin@bashari.com
- **Admin Password**: admin123
- **Admin Role**: super_admin
- **Customer Email**: customer@test.com
- **Customer Password**: customer123
- **Customer Role**: customer

---

## Session: Apr 21, 2026 — Mobile Fix · Documents & Email Refinement · Welcome Bulk

### Mobile Job Modal Overflow (P0 fix)
- ✅ Removed `-mx-4 px-4` negative margins from `DialogFooter` in `/app/frontend/src/components/ui/dialog.tsx` that caused the footer to be 32px wider than its container on mobile, producing the horizontal scroll / zoom-in effect.
- ✅ Verified: on 388×800 mobile viewport, both view mode AND edit mode have `document.documentElement.scrollWidth === window.innerWidth` with no wide offenders.

### Branded Print Document Refinement (P1)
- ✅ Rewrote `handlePrintJob` in jobs/page.tsx to produce a polished, print-color-safe HTML document.
- ✅ Added `COMPANY_INFO` constant (display name, legal name, address, phones, email, VAT, logo URL).
- ✅ Header now has real logo image + display name + legal subline + full contact panel on the right.
- ✅ Document title reflects job status (Intake Receipt / Job Memo / Completion Memo).
- ✅ Two party cards (Client / Lab Branch) showing name, address, phone, email — sourced from newly-extended Client & Branch interfaces that include address/phone/email.
- ✅ Stones table now includes a Flags column (CS = Color Stability Test, Mtd = Mounted) plus certificate group separators.
- ✅ Fee summary box shows subtotal + discount when applicable, then Total Fee (USD).
- ✅ Dual signature blocks (Client + Lab Representative) with date fields.
- ✅ Footer with legal name · address · phones · email · VAT · printed timestamp.
- ✅ Fixed print color rendering (`-webkit-print-color-adjust: exact`).
- ✅ UTF-8 charset meta tag to preserve em-dashes and Hebrew legal text.

### Email Template Refinement (P1)
- ✅ Full rewrite of `/app/backend/email_templates.py` with a consistent branded wrapper (navy header with logo, soft-navy body, legal-name footer with contact + VAT).
- ✅ Shared building blocks: `_header_html`, `_footer_html`, `_cta_button`, `_job_meta_pill` — used across every notification type.
- ✅ Re-styled tables to match navy palette; SKU rendered in monospace.
- ✅ Removed stale `actual_fee` references; introduced `_fees_breakdown_table` with optional Subtotal+Discount+Total.
- ✅ Each notification now includes a contextual CTA button linking back to the client portal.
- ✅ Verbal-results table reduced to 6 core columns so it renders well in narrow email clients.
- ✅ Added new `welcome` notification type.

### Bulk Welcome Email with Admin Selection (P1)
- ✅ Backend: `GET /api/notifications/welcome/preview?client_id=` returns subject + rendered html_body (optionally personalised).
- ✅ Backend: `POST /api/notifications/welcome/bulk` accepts `{client_ids: []}`, sends to each, handles:
  - Invalid ObjectId → status `failed`
  - Client missing → status `failed`
  - Client without email → status `skipped`
  - Resend configured → status `sent` (with resend_id logged)
  - Resend not configured → status `mocked`
  - Returns per-client results + summary `{sent, mocked, failed, skipped}`
  - Writes audit entry to `clients.notification_log` + `last_welcome_sent_at`
- ✅ Frontend: Clients page super-admin UI
  - Row checkboxes (desktop + mobile) behind `isSuperAdmin` guard
  - Header select-all checkbox (`data-testid=client-select-all`)
  - "Send Welcome Email" button with selection count badge (disabled when none selected)
  - Preview dialog uses an iframe rendering the actual email (personalised to first selected client) + recipients list
  - Confirm sends bulk and replaces preview with a results dashboard: counters (Sent/Mocked/Skipped/Failed) + per-client status table with icons

### Code Cleanup
- ✅ Hid "Add Client" button from customer role on /dashboard/clients for role consistency.

### Testing (iteration_21.json)
- ✅ 18 new backend tests (welcome preview + bulk + regression of 5 notification types + auth/clients/jobs)
- ✅ Frontend mobile overflow verified (scrollWidth == innerWidth, view + edit)
- ✅ Print HTML captured and all 10 content assertions pass
- ✅ Super-admin welcome dialog flow verified end-to-end
- ✅ Customer role guard verified (checkboxes + welcome button hidden)
- ✅ Success rate: **100% (backend + frontend)**

---

## Session: Apr 21, 2026 (later) — Palette Alignment + Print Doc Refinements

User feedback on iteration 21 output led to a follow-up pass:

1. ✅ **Palette aligned to app identity** (charcoal-black `#141417` + red `#E30613`, neutral grays `#3f3f46`/`#71717a`/`#a1a1aa`), replacing the blue-navy `#102a43` palette across:
   - `/app/frontend/src/app/(dashboard)/dashboard/jobs/page.tsx` (`handlePrintJob`)
   - `/app/backend/email_templates.py` (`BRAND_NAVY`, `TEXT_BODY`, `TEXT_MUTED`, `BG_SOFT`, `BORDER_SOFT`, body wrapper)
2. ✅ **Removed redundant top-right company-address block** from the print header (contact info already appears in the footer).
3. ✅ **Renamed group labels** in the stones table: instead of `Certificate 1 — Pair (2 stones)` the print now shows `pair-1 (2 stones)`, `pair-2 (2 stones)`, `layout-1 (5 stones)`, `single-1`, `multi-stone-1`. Numbering is per-type.
4. ✅ **Removed the amber "Certificates:" summary banner** from the header area.
5. ✅ **Added `Total Certificates` field** to the Job Summary grid (value = `groups + ungrouped_stones`). Grid widened to 5 columns.

All five items verified visually by rendering the print HTML and both `stones_accepted` + `stones_returned` email previews against the preview URL.

---

## Upcoming Tasks (P1)
- Refine dashboard for clients and for admin (further polish)
- **Shipments doc** — printable shipment document (similar to the job memo we just polished)
- **Shipments statuses view** — colour-coded progress pipeline for shipments (analogous to the job status pipeline)
- **Bulk client notifications per shipment** — allow admin to notify every client whose jobs are part of a given shipment (intake / dispatched / delivered)
- SMS and/or WhatsApp notifications integration (WhatsApp via Pulseem — pending user request)

## Future Tasks (P2)
- Mobile visibility full audit across all pages
- Prices — finalise (books, layouts etc)

## Blocked
- Tranzila BIT payments — awaiting App Key & Secret from user

---

## Session: Apr 23, 2026 — Shipments Redesign

User asked for a nicer way to display shipments in the shipments page, the dashboard, and reflect shipment status in the Jobs page. User chose:
- Labels: keep current (`Send Stones to Lab`, `Stones from Lab`, `Certificates from Lab`)
- Colour: neutral charcoal for all 3 types (differentiate by icon + direction arrow only)
- Progress: animated truck icon sliding left→right based on status
- Order: Shipments page → Jobs page → Dashboard

### A. Shipments page (/app/frontend/src/app/(dashboard)/dashboard/shipments/page.tsx)
- Added `typeFilter` state + per-type counts
- New **type tabs**: `All` / `Send Stones to Lab` / `Stones from Lab` / `Certificates from Lab` with icon + badge count
- Replaced the old dense table with a **responsive card grid** (1 col mobile, 2 cols desktop). Each card shows:
  - Type icon tile (Send / Gem / FileCheck2) + #shipment # + type label + courier/tracking
  - Status badge top-right
  - Route: `source → destination` with ArrowRight separator
  - **Animated truck progress bar** (new `TruckProgress` component with a rail, filled portion, `Truck` icon sliding to `pending=6% / in_transit=50% / delivered=94%`, bob animation, 3 step labels)
  - Footer: jobs · stones · value + quick actions (`Mark In Transit` / `Mark Delivered`)
- Cancelled shipments render as a red-tinted empty rail with "Cancelled" label
- Added `@keyframes bob` to `/app/frontend/src/app/globals.css`

### C. Jobs page shipment chip (/app/frontend/src/app/(dashboard)/dashboard/jobs/page.tsx)
- Extended `Job.shipment_info` TS type to include courier/tracking/source/destination
- New `ShipmentChip` component + `ShipmentTypeIcon` helper + `SHIPMENT_TYPE_LABELS` / `SHIPMENT_STATUS_LABELS` constants
- Replaced the plain `Badge #N + status` with a proper chip: type icon + `#N` + coloured status pill, with source→dest line beneath (truncated)
- Status pill uses distinct colours: charcoal for pending, navy-900 for in_transit, emerald for delivered, red for cancelled

### B. Dashboard shipments card (/app/frontend/src/app/(dashboard)/dashboard/page.tsx)
- Replaced the vertical "Recent Shipments" list with a **3-column summary** (one col per type)
- Each column shows: type icon tile + label + **in-transit count** (large number) + "pending" sub-counter (amber) + **mini truck progress bar** for the latest shipment of that type, with shipment # and status
- Entire column is a clickable button → goes to `/dashboard/shipments`
- Fetches full `allShipments` list (was previously sliced to 5)

### Bug fixes during implementation
- Removed unused `CardHeader`, `CardTitle` imports from shipments page (ESLint blocker)
- Removed unused `ArrowRight` import from dashboard page
- Suppressed unused `openShipmentModal` with `void` (legacy modal still rendered)

### Testing
- Visual smoke test confirmed on 1440×1000 admin session:
  - Shipments page: tabs switch correctly; card grid renders with animated truck for each shipment
  - Dashboard: 3-column shipments panel shows `0 in transit · 5 pending` for "To Lab" with latest=#11 delivered mini-bar
  - Jobs page: all jobs with shipments now show the typed chip with `#N` + `Delivered`/`Pending` pill + `Israel → HK Lab`
- Backend regression: `/api/shipments` returns 11 shipments, `/api/jobs` returns shipment_info with source/destination populated
