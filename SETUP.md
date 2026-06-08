# AgriSpectra — Setup Guide

A Next.js web app for crop health monitoring: leaf stress mapping, a live-weather
Crop Health Index, AI advice, Google sign-in, and saved history.

## 1. Install & run

```bash
cd web
npm install        # already done if you scaffolded
npm run dev        # http://localhost:3000
```

The app **runs without any credentials** — you'll see the UI, the leaf analysis,
the CHI gauge, and recommendations all work offline. Sign-in, the AI chat, and
saving history light up once you add the keys below.

## 2. Environment variables

Copy the example file and fill it in:

```bash
cp .env.local.example .env.local
```

| Variable | Where to get it | Public? |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase console → Project settings → Your apps (Web) | Yes (safe) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard | Yes |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Cloudinary → Settings → Upload (unsigned preset) | Yes |
| `GITHUB_TOKEN` | github.com → Settings → Developer settings → PAT | **No — server only** |

Restart `npm run dev` after editing `.env.local`.

## 3. Firebase (auth + history database)

1. Go to <https://console.firebase.google.com> → **Add project**.
2. In the project, click the **Web** icon (`</>`) to register a web app. Copy the
   `firebaseConfig` values into the `NEXT_PUBLIC_FIREBASE_*` vars.
3. **Authentication** → Get started → **Sign-in method** → enable **Google**.
4. **Authentication → Settings → Authorized domains** → make sure `localhost` is listed
   (it is by default). Add your production domain when you deploy.
5. **Firestore Database** → Create database → start in **production mode**.
6. Paste these security rules (Firestore → Rules) so each user only sees their own data:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /history/{docId} {
         allow read, delete: if request.auth != null
                             && request.auth.uid == resource.data.userId;
         allow create: if request.auth != null
                       && request.auth.uid == request.resource.data.userId;
       }
     }
   }
   ```

> **Firestore index:** the History page sorts by `createdAt` filtered by `userId`.
> The first time it runs, Firestore may log a console link to **create a composite
> index** (`userId ASC, createdAt DESC`). Click it once — takes ~1 minute to build.

## 4. Cloudinary (image hosting)

1. Sign in at <https://cloudinary.com> → copy your **Cloud name** into
   `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
2. **Settings → Upload → Upload presets → Add upload preset**.
3. Set **Signing Mode = Unsigned**, save, and copy the preset name into
   `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.

   (Unsigned presets allow browser uploads without exposing your API secret.
   Stress-map images are uploaded here; the returned URL is stored in Firestore.)

## 5. GitHub Models (AI chat)

1. <https://github.com/settings/tokens> → **Generate new token (classic)**.
   No special scopes needed for GitHub Models.
2. Put it in `GITHUB_TOKEN` (no `NEXT_PUBLIC_` prefix — it stays on the server,
   used only by `/api/chat`).

## How the pieces fit

```
Leaf photo ──► browser canvas (VARI analysis) ──► stress map
                                   │
Location ──► Open-Meteo (weather) ─┤
Soil slider ───────────────────────┤──► Crop Health Index + recommendations
                                   │
Save ──► image → Cloudinary (URL) ─┴─► metadata + URL → Firestore ──► History page
Chat ──► /api/chat ──► GitHub Models (GPT-4o mini), primed with your live readings
```

## Deploy (optional)

Push the `web/` folder to GitHub and import it on **Vercel**. Add the same
environment variables in the Vercel project settings, and add your Vercel domain
to Firebase **Authorized domains**.
