# Push notifications setup

PWA web push + app icon badge for new leads.

## 1. Install the new dependency

Stop your `next dev` server first (file locks on Windows), then:

```bash
npm install
```

This pulls in `web-push` + types (already added to `package.json`).

## 2. Add env vars

Add these to `.env.local` (and to Vercel project settings for production):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BLoVIYV1ZvyfCG-DNjHXl3t5-U4fkUXp3phY3gwh1qjBPxzfbn3rEawrouceD_YN5xhqiueMPjiryWqmiw_zSdY
VAPID_PRIVATE_KEY=Gbd0IN0N2lplltXSG2xr_BKWIDgfUxF3TSzFBt5THNM
VAPID_SUBJECT=mailto:christian@streamline-automations.agency
```

These keys were generated for you. Don't commit them — they go in `.env.local` only. If you ever want to rotate, run:

```bash
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=k.privateKey.export({format:'jwk'});console.log('public:',Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64'),Buffer.from(j.y,'base64')]).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));console.log('private:',j.d);"
```

## 3. Apply the database migration

Run `migrations/push-subscriptions.sql` in the Supabase SQL editor. It creates `public.push_subscriptions` with RLS so each user only sees their own.

## 4. Build & deploy

```bash
npm run build
```

`@ducanh2912/next-pwa` bundles `worker/index.ts` into the generated service worker, so the push + badge handlers ship automatically.

## 5. Try it

1. Deploy (push works on `https://` only — on localhost it works but you need to test in production for iOS).
2. Open the PWA, install to home screen (especially on iOS — iOS web push only works for installed PWAs on 16.4+).
3. Click the bell icon in the topbar → allow notifications.
4. Hit `POST /api/push/test` while logged in to send a test notification:
   ```bash
   curl -X POST https://your-domain/api/push/test --cookie "sb-access-token=..."
   ```
   Or just create a new lead via `/api/leads`.

## How it works

| Piece | File |
|---|---|
| Service worker handlers (push event, click, badge) | `worker/index.ts` |
| Topbar enable/disable button | `components/notifications-toggle.tsx` |
| Server push sender | `lib/push.ts` |
| Subscribe API | `app/api/push/subscribe/route.ts` |
| Unsubscribe API | `app/api/push/unsubscribe/route.ts` |
| Test push API | `app/api/push/test/route.ts` |
| Lead ingest trigger | `app/api/leads/route.ts` (only on new leads) |
| Badge clear on visit | `components/clear-badge-on-mount.tsx` (mounted on `/leads`) |

## Platform support

- **Android Chrome / Edge / desktop browsers** — works out of the box. Badge appears on the installed PWA icon.
- **iOS Safari** — push + badge work, but **only after the user installs the PWA to home screen** (iOS 16.4+).
- **Old browsers without PushManager** — the bell icon hides itself; nothing breaks.

## Troubleshooting

- "VAPID public key not configured" toast → env var missing or not exposed (must be `NEXT_PUBLIC_` prefix).
- Notification permission shows blocked → user must enable manually in browser site settings.
- No notification on new lead → check server logs for `Failed to send push`. Stale subscriptions (404/410) are auto-cleaned.
- Badge doesn't clear → make sure they open `/leads` (that's where `ClearBadgeOnMount` lives). Add it to other pages if you want it cleared elsewhere.
