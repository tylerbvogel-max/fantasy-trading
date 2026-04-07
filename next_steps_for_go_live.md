# Bounty Hunter — Next Steps for Go-Live

Reference document for App Store release preparation. Tracks what's done, what's blocking release, and detailed planning for each remaining item.

---

## Completed Phases

### Phase 1: Production Infrastructure
- Connection pooling (`pool_pre_ping`, `pool_recycle=300`, `NullPool` for tests)
- 15 database indexes across all query-heavy tables
- Alembic migration (`001_initial_schema`)
- CORS locked to `settings.allowed_origins`
- Tiered rate limiting middleware (auth 10/min, predict 30/min, read 60/min, admin 5/min)
- Environment-based config (`ENVIRONMENT`, `BOUNTY_WINDOW_MINUTES`, `CORS_ORIGINS`)
- NASA JPL/NPR linter compliance — all strict rules pass, JPL-4 guideline functions decomposed

### Phase 2: Test Suite & Quality Assurance (NASA NPR 7150.2D)
- 225 tests across 19 files, runs in ~15 seconds
- Test pyramid: 172 unit / 22 integration / 31 E2E
- Real PostgreSQL test database with transaction rollback per test (zero leak)
- NASA traceability matrix: 15 requirement IDs mapped to test files (`tests/nasa_compliance.py`)
- Config sync test: backend constants verified against simulation (`test_config_sync.py`)
- Coverage: `bounty_config.py` 100%, `middleware.py` 100%, all models/schemas 100%, overall 64%

### Phase 3: Authentication Overhaul
- Email/password registration and login with bcrypt (passlib) password hashing
- JWT access tokens (30-min, python-jose) with legacy opaque token fallback
- Refresh token rotation (90-day, stored hashed in DB, revocable)
- Dual-mode `get_current_user` — JWT first, legacy fallback (zero disruption for existing users)
- Email verification and password reset flows (Resend API in prod, console logging in dev)
- Account upgrade endpoint (legacy token users can migrate to email/password)
- Frontend updated: email/password form, forgot password, token refresh interceptor, legacy login preserved
- New endpoints: `/auth/v2/register`, `/auth/v2/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/upgrade`
- Migration: `migrations/002_auth_overhaul.sql` (new tables: `refresh_tokens`, `email_verification_tokens`, `password_reset_tokens`; new columns on `users`: `password_hash`, `email_verified`)

---

## Remaining Work — Ordered by Priority

### 1. Deploy Auth Changes to Render (BLOCKER)

The Phase 3 auth code is written and tested locally but not deployed.

**Steps:**
1. Set `SECRET_KEY` env var on Render to a secure random value (NOT "change-me-in-production"):
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```
2. Set `RESEND_API_KEY` env var if email sending is needed (or leave blank for console logging)
3. Set `APP_URL` env var to the Render deployment URL (`https://fantasy-trading-api.onrender.com`)
4. Push code to trigger Render auto-deploy
5. Run migration on production database:
   ```bash
   psql "$DATABASE_URL" < migrations/002_auth_overhaul.sql
   ```
6. Verify: `curl https://fantasy-trading-api.onrender.com/auth/dev-token` still returns 200

**Risk:** Existing users with legacy tokens continue working via dual-mode auth. No disruption.

---

### 2. Upgrade to Paid Render Tier (BLOCKER)

Free tier sleeps after 15 minutes of inactivity. Cold starts take 30-60 seconds. Apple reviewers will reject an app that takes a minute to load.

**Options (ranked by simplicity):**

| Provider | Plan | Cost | Notes |
|----------|------|------|-------|
| Render Starter | Web Service + PostgreSQL | $7 + $7/mo | Simplest — no migration, same `render.yaml` |
| Railway | Hobby | ~$5/mo usage-based | Auto-sleep configurable, good DX |
| Fly.io | Free Allowance | $0-5/mo | Requires Dockerfile, more setup |

**Steps for Render (recommended):**
1. Upgrade web service: Render Dashboard > fantasy-trading-api > Settings > Instance Type > Starter ($7/mo)
2. Upgrade database: Render Dashboard > PostgreSQL > Settings > Plan > Starter ($7/mo)
3. Enable automatic backups (included in paid DB plan)
4. Verify always-on: `watch -n 60 curl -s https://fantasy-trading-api.onrender.com/health`
5. Remove cron-job.org keep-alive ping (no longer needed)

---

### 3. Apple Developer Account (BLOCKER)

Required for TestFlight and App Store submission.

**Steps:**
1. Enroll at https://developer.apple.com/programs/enroll/
2. Cost: $99/year
3. Approval takes 24-48 hours
4. Once approved, sign into Xcode or App Store Connect

---

### 4. EAS Build Pipeline (BLOCKER)

Expo Go cannot be submitted to the App Store. Must build a standalone binary via Expo Application Services (EAS).

**Steps:**

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. Create `mobile/eas.json`:
   ```json
   {
     "cli": { "version": ">= 13.0.0" },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal",
         "ios": { "simulator": false }
       },
       "production": {
         "autoIncrement": true
       }
     },
     "submit": {
       "production": {
         "ios": {
           "appleId": "<APPLE_ID>",
           "ascAppId": "<APP_STORE_CONNECT_APP_ID>",
           "appleTeamId": "<TEAM_ID>"
         }
       }
     }
   }
   ```

3. Update `mobile/app.json`:
   - Set `apiUrl` to `https://fantasy-trading-api.onrender.com` (prod)
   - Ensure `ios.bundleIdentifier` is set (`com.fantasytrading.app`)
   - Add `icon` field pointing to a 1024x1024 PNG
   - Add `splash.image` field

4. First build:
   ```bash
   cd mobile
   eas build --platform ios --profile production
   ```
   - This will prompt for Apple credentials and create provisioning profiles automatically
   - Build runs on EAS cloud servers (free tier: 30 builds/month)

5. Submit to TestFlight:
   ```bash
   eas submit --platform ios --profile production
   ```

6. Test on TestFlight, then submit for App Store review from App Store Connect

**Assets needed before build:**
- App icon: 1024x1024 PNG (no transparency, no rounded corners — Apple adds those)
- Splash screen image (optional, currently solid black)

---

### 5. App Store Requirements (BLOCKER)

Apple requires these for submission. Missing any one causes rejection.

**A. Privacy Policy**
- Must be hosted at a public URL
- Must describe: what data is collected (email, alias, gameplay stats), how it's stored (PostgreSQL, hashed passwords), third-party services (Resend for email, Finnhub/Yahoo for stock data)
- Can use a generator like https://www.privacypolicygenerator.info/ as a starting point
- Host on a simple static page or GitHub Pages

**B. Account Deletion**
- Apple requires apps with accounts to offer account deletion (since June 2022)
- Implementation needed:
  - Backend: `DELETE /auth/account` endpoint — deletes user, player stats, predictions, irons, badges, titles, refresh tokens, email tokens
  - Frontend: Button in Profile screen with confirmation dialog
  - Must actually delete data, not just deactivate

**C. App Store Connect Metadata**
- App name, subtitle, description, keywords
- Category: Finance or Games > Simulation
- Age rating: complete the questionnaire (no gambling since it's virtual currency)
- Screenshots: 6.5" iPhone (1290x2796) and 5.5" iPhone (1242x2208) — minimum 3 each
- Support URL (can be a simple page or GitHub repo link)

**D. Export Compliance**
- The app uses HTTPS and bcrypt/SHA-256 — answer "Yes" to encryption question
- Then answer "Yes" to "Does your app qualify for any exemptions?" (standard encryption exemption)
- No annual self-classification report needed for standard HTTPS

---

### 6. APScheduler Duplication Guard (SHOULD-HAVE)

If Render ever runs 2+ instances, APScheduler jobs execute on every instance — duplicate windows, double settlements.

**Minimum fix (single-instance safe):**
Add a PostgreSQL advisory lock around critical jobs:

```python
# In bounty_service.py — wrap settle_window and create_bounty_windows
async with db.begin():
    # pg_try_advisory_xact_lock returns True if lock acquired
    result = await db.execute(text("SELECT pg_try_advisory_xact_lock(1)"))
    if not result.scalar():
        return  # Another instance is already running this job
    # ... proceed with settlement
```

**Full fix (Phase 4):**
- Extract to Celery + Redis, or use Render Cron Jobs ($1/mo per job)
- Render Cron Jobs: define in `render.yaml`, runs on a single instance

---

### 7. Push Notifications (SHOULD-HAVE)

Without notifications, players forget to check the app. Critical for engagement.

**Implementation plan:**

1. Install: `npx expo install expo-notifications expo-device expo-constants`

2. Backend changes:
   - Add `push_token` column to `users` table
   - `POST /auth/push-token` endpoint — stores Expo push token
   - In `settle_window()`: after settlement, send push to all players who had predictions
   - In `create_bounty_windows()`: send push "New bounty window open!"
   - Use Expo Push API: `POST https://exp.host/--/api/v2/push/send`

3. Frontend changes:
   - Request notification permissions on first login
   - Register push token with backend
   - Handle notification taps (navigate to Bounty screen)

4. Required for EAS build (not Expo Go) — push tokens only work in standalone builds

---

### 8. Error Monitoring (SHOULD-HAVE)

Currently blind to crashes in both backend and mobile.

**Backend — Sentry:**
```bash
pip install sentry-sdk[fastapi]
```
```python
# app/main.py
import sentry_sdk
sentry_sdk.init(dsn="...", traces_sample_rate=0.1)
```

**Mobile — Sentry:**
```bash
npx expo install @sentry/react-native
```
- Requires EAS build (native module)
- Configure in `App.tsx` with `Sentry.init()`
- Captures JS errors, native crashes, performance traces

**Alternative:** Expo's built-in error reporting via `expo-updates` (less detailed but zero setup)

---

### 9. CORS Lock for Production (SHOULD-HAVE)

Currently `CORS_ORIGINS` env var is empty on Render, which defaults to `["*"]` in dev mode. In production:

```bash
# Set on Render
CORS_ORIGINS=https://fantasy-trading-api.onrender.com
```

For a mobile-only app, CORS is less critical (native HTTP clients don't send Origin headers), but should still be locked down.

---

### 10. Account Deletion Endpoint (BLOCKER — Apple Requirement)

**Backend (`app/routers/auth.py`):**
```
DELETE /auth/account
  - Requires authentication
  - Deletes: user, bounty_player_stats, bounty_predictions, bounty_player_irons,
    bounty_iron_offering, refresh_tokens, email_verification_tokens, password_reset_tokens
  - Revokes all tokens
  - Returns 200 with confirmation message
```

**Frontend (`ProfileScreen.tsx`):**
- "Delete Account" button at bottom of profile
- Confirmation dialog: "This will permanently delete your account and all game progress. This cannot be undone."
- On confirm: call DELETE endpoint, then sign out

---

## Nice-to-Have (Post-Launch)

These improve the experience but aren't blocking release:

- **OAuth (Google/Apple Sign-In)** — reduces registration friction, requires EAS build
- **Offline support** — queue predictions when offline, submit when back online
- **Redis** — shared cache across instances, real-time rate limiting
- **HTML email templates** — branded verification/reset emails (plain text works fine)
- **Deep linking** — email verification/reset links open directly in the app
- **Animated splash screen** — branded loading animation instead of black screen
- **App Store Optimization** — A/B test screenshots, keywords, description

---

## Release Checklist

```
[ ] Deploy auth changes to Render + run migration
[ ] Set SECRET_KEY, RESEND_API_KEY, APP_URL env vars on Render
[ ] Upgrade Render to paid tier (web + DB)
[ ] Apple Developer account enrolled and approved
[ ] App icon designed (1024x1024 PNG)
[ ] eas.json created and configured
[ ] First EAS build succeeds
[ ] Account deletion endpoint implemented
[ ] Privacy policy hosted at public URL
[ ] TestFlight build distributed and tested
[ ] App Store Connect metadata filled out (screenshots, description, etc.)
[ ] Push notifications working in standalone build
[ ] Sentry configured for backend + mobile
[ ] APScheduler duplication guard added
[ ] CORS locked in production
[ ] App Store review submitted
```
