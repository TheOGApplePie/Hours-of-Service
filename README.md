# Hours of Service

A web application for electronically logging and managing Hours of Service (HoS) records, built with Next.js 15. Compliance rules follow **MTO Ontario** regulations.

---

## What it does

Hours of Service replaces paper-based driver logs with a digital system. It supports two distinct user experiences based on role:

**Drivers** can:
- View their weekly Hours of Service document listing, navigating backwards and forwards by week
- Open any date to create or edit that day's duty status log
- Mark themselves as off for the day with a single checkbox
- See a visual canvas graph of their duty statuses for the day
- Print a weekly Hours of Service PDF report
- See active compliance banners when a manager has sent them a reminder, with clickable date chips that navigate directly to the relevant document

**Managers** can do everything Safety officers can, plus:
- Update driver profiles (name, role)
- Mark drivers as active or inactive

**Managers and Safety officers** can:
- View a dashboard with a searchable, paginated list of all users
- Click any user to view and edit their Hours of Service documents on their behalf
- Bulk export Hours of Service records as a PDF across a selected date range and set of users
- Monitor four live metrics across the fleet:
  - **Earliest activity this week** — who started earliest and when
  - **Latest activity this week** — who finished latest and when
  - **Offending users** — users breaching any MTO Ontario rule (see below)
  - **Missing Hours of Service** — users with any missing submission on a workday within the past two weeks
- Click any metric card or label to open a detail modal showing the relevant user(s), their violation details, and their Hours of Service canvas
- Send reminder emails to offending or missing users directly from the metric modal (tracked per user, one reminder per two-week window)
- Mark violation reminders as resolved from the metric modal

---

## MTO Ontario compliance rules

The following rules are evaluated for all active users:

| Rule | Limit |
|---|---|
| Daily driving | Max 13 hours on-duty-driving per day |
| Daily on-duty | Max 16 hours NOT off-duty per day |
| Weekly on-duty | Max 70 hours NOT off-duty in any rolling 7-day window |
| 15-day rest | At least one continuous 24-hour off-duty block every 15 days |

Users with `is_active_driver: false` in their profile are excluded from all compliance metrics.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Language | TypeScript |
| Auth | Firebase Authentication (current) |
| Database | Cloud Firestore (current) |
| Styling | Tailwind CSS + DaisyUI |
| Forms | React Hook Form |
| PDF generation | @react-pdf/renderer |
| Date utilities | date-fns |
| Icons | lucide-react |

---

## Architecture

### Repository pattern

All data access is isolated behind platform-agnostic interfaces in `lib/repositories/`. The current Firebase implementations live in `lib/firebase/`. The single wiring point is `lib/firebase/index.ts` — the only file that changes when migrating to a different backend.

```
lib/
  repositories/
    IAuthProvider.ts           # Auth contract (signIn, signOut, onAuthStateChanged)
    IDriverRepository.ts       # Driver profile contract
    IHosRepository.ts          # Hours of Service document contract
    INotificationRepository.ts # Notification contract
  firebase/
    FirebaseAuthProvider.ts    # Firebase Auth implementation
    FirebaseDriverRepository.ts
    FirebaseHosRepository.ts
    FirebaseNotificationRepository.ts
    index.ts                   # Wires implementations to interfaces — change this to migrate
```

Service files (`hosService.ts`, `driverService.ts`, etc.) and all UI code import from the interfaces only. No Firebase SDK calls outside of `lib/firebase/`.

### Project structure

```
app/
  components/
    BulkExportModal.tsx      # Multi-user, multi-week PDF export modal
    DailyLogsCanvas.tsx      # Canvas-based Hours of Service graph
    DatePickerModal.tsx      # Week navigation date picker modal
    Header.tsx               # App header with logout
    HoursofServicePDF.tsx    # PDF document components (single + bulk)
    MetricCard.tsx           # Coloured dashboard metric card
    MetricLabel.tsx          # Plain text label paired with MetricCard
    MetricModal.tsx          # Detail modal for a dashboard metric + reminder button
    NotificationBanner.tsx   # Active reminder banner on the documents listing page
    UnsavedChangesModal.tsx  # Confirmation modal for unsaved form changes
    WeekRangeCalendar.tsx    # Reusable week-range calendar picker
  dashboard/
    layout.tsx               # Dashboard layout with header
    page.tsx                 # Manager/safety dashboard
    style.css                # Dashboard-specific styles (metric cards)
  documents/
    layout.tsx               # Documents layout with header
    page.tsx                 # Weekly document listing page
    [date]/
      page.tsx               # Individual Hours of Service document edit page
  login/
    page.tsx                 # Login page
  globals.css                # Design tokens, button utility classes
  layout.tsx                 # Root layout with AuthProvider
  page.tsx                   # Root redirect (-> /login, /documents, or /dashboard)

contexts/
  AuthContext.tsx            # Auth state + role, restored on page refresh

lib/
  firebase.ts                # Firebase SDK initialisation
  repositories/              # Platform-agnostic data access interfaces
  firebase/                  # Firebase implementations + wiring
  bulkExportService.ts       # Fetch for bulk PDF export
  dashboardService.ts        # Dashboard metrics computation
  driverService.ts           # Driver profile operations
  hosService.ts              # Hours of Service document operations
  mtoCompliance.ts           # MTO Ontario compliance rule checks (pure TS, no data access)
  notificationService.ts     # Notification operations
  weekUtils.ts               # Week/date utility functions (pure TS)

types/
  dailyDocument.ts           # DailyDocument and Status interfaces
  dashboard.ts               # DashboardMetrics, MetricDriverDetail, MtoViolation, MetricKind
  notification.ts            # Notification, NotificationType, NotificationStatus
  rawStatus.ts               # RawStatus (no mapped_time UI field)
```

---

## Data model

### Firestore collections

| Collection | Description |
|---|---|
| `drivers` | One document per user. Fields: `name`, `role` (`driver`, `safety`, or `manager`), `is_active_driver` (boolean) |
| `hours_of_service` | One document per user per day. Fields: `driver_id`, `date_of_document` (yyyy-MM-dd), `parking_location`, `comments`, `statuses`, `created_at`, `updated_at` |
| `notifications` | One document per reminder sent. Fields: `driver_id`, `type`, `message`, `sent_by`, `sent_at`, `created_at`, `related_dates`, `status`, `read` |

### Required Firestore indexes

| Collection | Fields | Purpose |
|---|---|---|
| `notifications` | `driver_id` ASC, `sent_at` DESC | Fetch all notifications for a user |
| `notifications` | `driver_id` ASC, `type` ASC, `sent_at` DESC | Fetch latest notification by type + anti-spam check |
| `hours_of_service` | `driver_id` ASC, `date_of_document` DESC | Parking location prefill (most recent prior document) |

---

## Design system

All colours are defined as CSS custom properties in `app/globals.css`:

| Token | Value | Usage |
|---|---|---|
| `--colour-success` | `#2a9d8f` | Good state, teal |
| `--colour-error` | `#c0392b` | Error / alarm state, red |
| `--colour-warning` | `#E6C200` | Warning state, gold |
| `--colour-action` | `#1e2a3a` | Generic action button background |
| `--colour-action-text` | `#C0C0C0` | Generic action button text (silver) |
| `--colour-primary` | `#DBEAFE` | Elevated action button background (light blue) |
| `--colour-primary-text` | `#1e40af` | Elevated action button text (royal blue) |

Reusable button classes: `btn-action`, `btn-primary-action`, `btn-success`, `btn-warning-action`, `btn-error-action`

Utility colour classes: `text-colour-success`, `text-colour-error`, `text-colour-warning`, `text-colour-primary`, `bg-colour-success`

---

## Running locally

### Prerequisites

- Node.js 18+
- A Firebase project with **Authentication** (Email/Password) and **Firestore** enabled

### 1. Clone the repository

```bash
git clone <repo-url>
cd hours-of-service
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=<your-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-storage-bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your-messaging-sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<your-app-id>
```

### 4. Seed Firestore

Each user must have a document in the `drivers` collection with their Firebase Auth UID as the document ID:

```json
{
  "name": "Jane Smith",
  "role": "driver",
  "is_active_driver": true
}
```

Valid roles: `driver`, `safety`, `manager`. Users with `safety` or `manager` roles are directed to the dashboard on login. Set `is_active_driver: false` to exclude a user from compliance metrics without deleting their records.

### 5. Create Firestore indexes

Create the three composite indexes listed in the **Required Firestore indexes** table above via the Firebase Console under **Firestore → Indexes → Composite**.

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Building for production

```bash
npm run build
npm start
```
