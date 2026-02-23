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
  - Table of options with Value and Stone Types columns
  - Add/Edit/Delete options with inline editing
  - Stone type badges with click-to-toggle filtering (all, Emerald, Sapphire, Ruby, etc.)
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

### Backend (Previously Complete)
- ✅ Full CRUD APIs for all entities
- ✅ Shipment workflow with job linking
- ✅ Auto-SKU generation for stones (FIXED)
- ✅ PDF generation (Memo-in, Invoice, Shipment docs)
- ✅ Dashboard stats API
- ✅ Notification system (MOCKED - no Twilio/SMTP)
- ✅ Stone grouping for certificates API
- ✅ Memo upload API

---

## Prioritized Backlog

### P0 - Critical
- None currently

### P1 - High Priority
- [ ] Real notification system (Twilio SMS, SMTP email)

### P2 - Medium Priority
- [x] Verbal findings entry and display (Implemented in Stone Dialog)
- [x] Document upload for certificate scans (Implemented in Stone Dialog)
- [ ] Cloud storage for uploaded files (currently base64 in MongoDB)

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
│   ├── server.py           # FastAPI backend
│   ├── tests/
│   │   └── test_jobs_api.py  # API tests
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx          # Root layout
    │   │   ├── page.tsx            # Root redirect
    │   │   ├── globals.css         # Global styles
    │   │   ├── login/
    │   │   │   └── page.tsx        # Login page
    │   │   └── (dashboard)/
    │   │       ├── layout.tsx      # Dashboard layout with sidebar
    │   │       └── dashboard/
    │   │           ├── page.tsx           # Main dashboard
    │   │           ├── shipments/page.tsx # Shipments management
    │   │           ├── jobs/page.tsx      # Jobs management (TESTED)
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

## Known Issues
1. **Platform Preview Bug**: The Emergent platform "Preview" button shows an Expo QR code. Workaround: Use direct URL to access the app.
2. **Notification System**: Currently mocked - no actual SMS/Email sent

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
