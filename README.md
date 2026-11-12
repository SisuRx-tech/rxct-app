# RxCT fixes — ready to copy

**Target:** `SisuRx-tech/rxct-app`, branch `smart-search`.

This pack contains complete replacement files plus a small patch for two existing files.

## What it fixes

1. **Group and class study profiles:** therapeutic groups read from `group_content`; drug classes read from `class_content`. Medicine-label fallback dropdowns are removed. Classification remains the only place to browse a group's classes or a class's member medicines.
2. **Imported-content transparency:** imported study records remain visible with their existing `imported` status and source. Nothing is promoted to reviewed.
3. **Class name casing:** the shared `formatClassName` helper preserves numeric suffixes such as `3A` across the app.
4. **Launcher icon:** uses the exact supplied X mark and exact sampled background `#164b45`, with a substantially larger mark. `any` and `maskable` assets are separate.
5. **Splash transition:** paints from inline HTML before React, uses a transparent X asset, removes the old clipped-letter animation, keeps the route tree mounted behind the overlay, and waits briefly for icon fonts before fading into the first painted screen.
6. **Medicines activity spacing:** adds 32px above Recent activity so it no longer sits against the interaction checker.

## Apply

1. Back up or commit your current work.
2. Check out `smart-search`.
3. Extract this ZIP into the repository root, preserving folders and allowing the included replacement files to overwrite the existing ones.
4. Apply the patch from the repository root:

   `git apply patches/apply-after-copying.patch`

5. Verify:

   `git diff --check`

   `npm run lint`

   `npm run build`

6. Preview locally before pushing. Do not deploy if lint/build fails.

## Files replaced by the ZIP

- `index.html`
- `vite.config.js`
- `src/App.jsx`
- `src/components/Splash.jsx`
- `src/components/Splash.css`
- `src/services/profiles.js`
- `src/components/study/ClassProfile.jsx`
- `src/components/study/GroupProfile.jsx`
- `public/favicon.png`
- `public/apple-touch-icon.png`
- `public/rxct-x-icon-192.png`
- `public/rxct-x-icon-512.png`
- `public/rxct-maskable-512.png`
- `public/rxct-x-mark.png`

The patch modifies:
- `src/utils/labelText.js`
- `src/components/medicines/MedicinesLanding.module.css`

No Supabase rows, policies, schema, or medicine data are changed.

## After deployment

Android can cache installed-PWA launcher assets and launch snapshots. Once the new deployment is live, remove the old RxCT home-screen installation and install it again from the updated site to refresh the icon and launch screen.
