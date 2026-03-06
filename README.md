# Security Command Center

Unified management command platform for monitoring both DRS Data Response Security and Big 5 Security.

## Features
- Google login + role-based access (`owner`, `management`, `admin`)
- Unified cross-company dashboard with live KPIs
- Per-company metrics: active guards, incidents today, patrol completion, attendance
- Cross-company analytics charts
- Live map for incident/guard activity locations
- Panic alert feed
- Report exports (CSV/PDF/Google Sheets)
- Admin QR generator with printable PDF output
- Automated daily/weekly report workflow via GitHub Actions

## Stack
- React + Vite + TypeScript
- TailwindCSS + Recharts
- Firebase Auth + Firestore
- Google Maps
- jsPDF + html2canvas + qrcode

## Local Setup
1. `npm install`
2. Copy `.env.example` to `.env` and populate keys.
3. `npm run dev`
4. `npm run build`

## Deployment (Free Tier)
- Firebase Spark plan for hosting + Firestore + auth.
- Deploy:
  - `firebase deploy --only firestore:rules,firestore:indexes,hosting`
- Push to GitHub repo:
  - `https://github.com/RayMhlongo/security-command-center`

## Automated Reports
GitHub Action `.github/workflows/automated-reports.yml` sends daily/weekly summaries to Google Sheets.

Required repository secrets:
- `SHEETS_WEBHOOK_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Manual run:
- `npm run report:daily`

## Expected Firestore Collections
- `users`
- `DRS_attendance`, `DRS_patrol`, `DRS_incident`, `DRS_panic`
- `BIG5_attendance`, `BIG5_patrol`, `BIG5_incident`, `BIG5_panic`
- `auditLogs`

## Security Notes
- Apply RBAC rules in `firestore.rules`.
- Restrict Google Maps/Firebase API keys by domain/application.
- Keep service-account credentials only in GitHub secrets (never in repo).
