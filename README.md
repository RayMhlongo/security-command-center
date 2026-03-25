# Security Command Center

Unified owner/management platform for DRS + Big 5 operations.

## New Final Update: Multi-Branch + Role Onboarding
- First login requires role selection (`Owner`, `Management`, `Admin`, `Guard`).
- Non-owner users must choose company + branch.
- Owner is assigned full all-company/all-branch scope.
- Profile persisted in Firebase `users` and used for scoped access.

## Multi-Branch Command Center
Owner can filter by:
- Company: `All`, `DRS`, `Big 5`
- Branch: all branches or a specific branch (when single company is selected)

Dashboard now shows scoped, near-real-time data for:
- Active guards
- Incidents
- Patrol completion
- Attendance logs
- Incident/panic map points

## Offline Caching
- Dashboard snapshots are cached in IndexedDB (`command_center_cache`)
- On temporary outages, last cached snapshot is loaded automatically

## Retained Features
- Cross-company analytics charts
- Panic alerts view
- QR + printable PDF generation
- CSV/PDF/Google Sheets export
- Daily/weekly automated reports via GitHub Actions
- Firebase RBAC rules + audit-log compatibility

## Setup
1. `npm install`
2. Copy `.env.example` to `.env`
3. Fill Firebase + Maps + Sheets values
4. `npm run dev`
5. `npm run build`
6. `npm run android:sync`

## Firebase Deploy
- `firebase deploy --only firestore:rules,firestore:indexes,hosting`

## GitHub Actions (Automated Reports)
Required secrets:
- `SHEETS_WEBHOOK_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## Android APK Build
1. `npm run build`
2. `npm run android:sync`
3. `npm run android:open`
4. Build signed APK in Android Studio

## GitHub APK Action Secrets
Set these repository secrets so release APK builds are fully configured:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_GOOGLE_MAPS_API_KEY`

## Stress Test
- `npm run stress:test`

## GitHub
- https://github.com/RayMhlongo/security-command-center
