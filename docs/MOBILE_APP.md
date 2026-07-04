# SpyReels mobile app

SpyReels ships as a mobile-friendly web app (PWA) and as native iOS/Android shells via Capacitor.

## Phase 1: PWA (production web)

After deploy, logged-in users on mobile may see an install banner on dashboard pages.

- **Manifest + service worker**: `vite-plugin-pwa` in `vite.config.ts`
- **Install UX**: `client/src/components/PwaInstallBanner.tsx`
- **PostHog events**: `pwa_install_prompted`, `pwa_installed`, `pwa_install_dismissed`

**Verify**

1. Build and deploy (`pnpm build`).
2. Open `https://spyreels.ai/dashboard` on Android Chrome or iOS Safari.
3. Confirm install prompt or iOS Share > Add to Home Screen hint.
4. Installed app opens to `/plan` (Today tab) in standalone mode.

## Mobile create app (PWA + Capacitor)

When the app runs as an **installed PWA** or **Capacitor shell**, SpyReels uses a phone-first layout:

- **Bottom tabs:** Today, Write, Scripts, More
- **Research routes** redirect to Today
- **Full desktop** link on the More screen

See `client/src/components/MobileAppLayout.tsx` and `shared/mobileCreateApp.ts`.

## Phase 2: Capacitor (App Store / Play Store)

The native apps are thin shells that load the production site in a WebView. API calls and Google OAuth use absolute URLs via `VITE_APP_ORIGIN` / `resolveAppUrl()`.

**Config**: `capacitor.config.ts`  
**Scripts**:

```bash
pnpm cap:sync    # build web assets + sync to ios/ and android/
pnpm cap:ios     # open Xcode
pnpm cap:android # open Android Studio
```

**Local dev against production**

```bash
CAPACITOR_SERVER_URL=https://spyreels.ai pnpm cap:sync
pnpm cap:ios
```

**Local dev against a tunnel** (optional)

```bash
CAPACITOR_SERVER_URL=https://your-tunnel.example.com pnpm cap:sync
```

Set `VITE_APP_ORIGIN` to the same origin when building a bundled shell that should not use relative `/api` paths.

**Regenerate brand icons and splashes** (PWA + iOS + Android):

```bash
pnpm mobile:assets
```

## Store submission checklist

1. App icons and splash screens in `ios/` and `android/` (replace Capacitor defaults).
2. Privacy policy URL: `https://spyreels.ai/privacy`
3. OAuth: ensure Google Cloud OAuth client allows the custom URL scheme / bundle ID if using native redirect flows.
4. Test login, dashboard reel grid, hook generator, and coach scripts on device.
5. Archive in Xcode / generate signed AAB in Android Studio.

## Files

| File | Purpose |
|------|---------|
| `client/src/lib/nativeApp.ts` | `isNativeApp`, `isPwaStandalone`, `resolveAppUrl` |
| `client/src/lib/mobileCreateApp.ts` | Mobile create mode detection |
| `client/src/components/MobileAppLayout.tsx` | Bottom tab bar + niche bar |
| `shared/mobileCreateApp.ts` | Mobile route allowlist + tab mapping |
| `client/src/lib/pwaInstall.ts` | `beforeinstallprompt` handling |
| `client/src/components/PwaInstallBanner.tsx` | Dashboard install CTA |
| `capacitor.config.ts` | App ID, WebView server URL, splash/status bar |
