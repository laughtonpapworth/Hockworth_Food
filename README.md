# Our Meal Plan

A household app: the joint meal plan, a shopping list that syncs live between both your phones,
and a dairy/soy/wheat/FODMAP ingredient checker with a barcode scanner.

## What's in here

```
meal-app/
  public/                        <- everything that gets deployed
    index.html
    css/style.css
    js/app.js                     <- tabs, recipe rendering, shopping list + sync
    js/checker.js                  <- ingredient matching + barcode scanning
    js/firebase-config.js           <- YOUR Firebase project keys go here (step 4)
    data/recipes.json                <- the joint meal plan — edit this to change meals
    data/ingredient-rules.json        <- his/her allergen + FODMAP term lists
    manifest.json                     <- PWA config (installable icon)
    service-worker.js                  <- basic offline caching
    icons/                              <- add icon-192.png and icon-512.png here (step 9)
  firebase.json
  firestore.rules                 <- controls who can read/write the shared shopping list
  firestore.indexes.json
  .firebaserc                     <- your Firebase project ID goes here (step 3)
  .github/workflows/deploy.yml     <- auto-deploys Hosting on every push to main
```

---

## Step-by-step setup

This assumes: you have the empty GitHub repo **Papworth_food** already created, and Node.js
installed on your computer (for the Firebase CLI). Steps 1–8 are one-time setup; after that,
every `git push` deploys automatically.

### 1. Create the Firebase project
Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** →
name it (e.g. `papworth-food`) → you can decline Google Analytics, it's not needed → **Create project**.

### 2. Enable Firestore
In the left sidebar: **Build → Firestore Database → Create database**.
- Choose **Start in production mode** (the rules file in this repo controls access properly).
- Pick a location close to you — `europe-west2` (London) is the sensible choice for the UK.

### 3. Enable sign-in methods
Left sidebar: **Build → Authentication → Get started → Sign-in method**, then enable both:
- **Google** — it'll ask for a support email, use either of yours. **Save**.
- **Email/Password** — just toggle it on. **Save**.

Firebase automatically authorises `localhost` and your `*.web.app` Hosting domain for sign-in,
so no extra domain setup is needed unless you later add a custom domain.

### 4. Register a web app and get your config keys
Project settings (gear icon, top left) → scroll to **Your apps** → click the **</>** (web) icon →
give it any nickname → **Register app**. It'll show you a `firebaseConfig` object like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "papworth-food.firebaseapp.com",
  projectId: "papworth-food",
  storageBucket: "papworth-food.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

Copy those real values into `public/js/firebase-config.js` in this repo, replacing the
`REPLACE_ME` placeholders. This file is safe to commit — these are public client identifiers,
not secrets; `firestore.rules` is what actually controls access.

### 5. Fill in your project ID in two more places
Replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` with your real project ID (e.g. `papworth-food`) in:
- `.firebaserc`
- `.github/workflows/deploy.yml` (the `projectId:` line)

### 6. Install the Firebase CLI and log in
```bash
npm install -g firebase-tools
firebase login
```
This opens a browser window to sign into the same Google account you used for Firebase.

### 7. Link this repo to Firebase Hosting + GitHub Actions
From inside the `meal-app` folder on your computer:
```bash
cd meal-app
firebase init hosting:github
```
It'll ask a series of questions — answer:
- *Please select an option* → **Use an existing project** → pick the one you made in step 1
- *What GitHub repository would you like to set up a GitHub workflow for?* → type `Papworth_food` (or `yourusername/Papworth_food` if it asks for the full path)
- *Set up the workflow to run a build script before every deploy?* → **No**
- *Set up automatic deployment to your site's live channel when a PR is merged?* → **Yes**, branch `main`

This automatically adds a `FIREBASE_SERVICE_ACCOUNT` secret to your GitHub repo and writes a
workflow file — it may overwrite `.github/workflows/deploy.yml`. That's fine, it does the same
job as the one already in this repo.

*(If you'd rather do it by hand instead of using this command: Firebase console → Project
settings → Service accounts → Generate new private key → download the JSON → paste its contents
into a new GitHub repo secret named `FIREBASE_SERVICE_ACCOUNT` under
Papworth_food → Settings → Secrets and variables → Actions.)*

### 8. Deploy the rules
Access is controlled by household membership now (see "Logins and households" below), not a
hardcoded email list, so `firestore.rules` needs no editing. Just deploy it — this is a one-off,
not handled by the GitHub Action:
```bash
firebase deploy --only firestore:rules
```
Only needs re-running if you ever change `firestore.rules` itself.

### 9. Icons (optional, for the "add to home screen" prompt)
Drop a 192×192 and a 512×512 PNG into `public/icons/`, named `icon-192.png` and `icon-512.png`.
Anything simple works.

### 10. Push it
```bash
git init
git add .
git commit -m "First run: joint meal plan app"
git branch -M main
git remote add origin https://github.com/<your-github-username>/Papworth_food.git
git push -u origin main
```

Watch the **Actions** tab on the Papworth_food GitHub repo — it'll run the deploy workflow
automatically. Once it's green, your app is live at `https://<your-project-id>.web.app`.

### 11. Test the sync
Open the URL on both your phones, sign in with Google (whichever of your two accounts you're
holding), go to **Shopping List**, and tick something on one — it should appear ticked on the
other within a second or two. If sign-in itself fails, double check step 3. If sign-in works but
ticks don't sync, it's almost always step 8 — the email in `firestore.rules` not matching exactly
the Google account you signed in with.

---

## Logins and households

Anyone can sign in with Google or an email/password of their own — there's no fixed pair of
accounts baked into the app any more. After signing in for the first time, each person either:

- **Creates a household** — gets a 6-character invite code (e.g. `PAPWORTH`) to share with
  their partner, or
- **Joins a household** — types in a code someone else shared with them.

Everyone in a household sees the same shared data (plan, shopping list, calendar, profiles,
pantry, events). A different household's data is completely separate and invisible to you —
this is enforced by `firestore.rules`, not just by the app's UI.

So testing this with your sisters is just: send them the site link. They sign up, create their
own household, and share their code with their partner. Nothing to configure on your end, and
their data never touches yours.

### Moving your existing data into a household (one-off)

Your current data lives under the old `household/...` path from before this change. To move it
into your own household, sign in on the live site as normal, open your browser's dev console
(F12 → Console tab), and paste this once:

```js
(async () => {
  const db = firebase.firestore();
  const code = 'PAPWORTH'; // pick your own 6-character code if you'd rather
  const uid = firebase.auth().currentUser.uid;
  const houseRef = db.collection('households').doc(code);

  await houseRef.set({ code, members: [uid], createdAt: Date.now() });

  const oldDocs = ['shopping-list','recipe-status','saved-recipes','pantry','calendar','events','event-shopping-checked','profiles'];
  for (const name of oldDocs) {
    const snap = await db.collection('household').doc(name).get();
    if (snap.exists) await houseRef.collection('data').doc(name).set(snap.data());
  }
  console.log('Done. Your household code is', code);
})();
```

Then give Laura that code — she signs in with her own login and joins with it, landing in the
same shared data you've always had.

---

## Importing recipes from a link (BBC Good Food, etc.)

Discover has an "Import from a recipe link" box. Paste in a recipe page URL and it pulls out the
title, ingredients and method automatically — this works for BBC Good Food and most other recipe
sites, because they publish that data in a standard format for Google's own recipe search results.
There's also a shortcut to open BBC Good Food's own search in a new tab, so you can find a recipe
there and paste its link back in.

This needs a small piece of server-side code (in `functions/`), because a browser can't fetch
another website's page directly. One-off setup:

1. **Upgrade to the Blaze plan** — Firebase console → click your project name/settings icon (bottom
   left) → **Upgrade** → choose **Blaze (pay as you go)**. You'll need a card on file, but normal
   household use stays well within the free monthly allowance (2 million function calls), so
   realistic cost is £0. Optional: set a budget alert in the same screen for peace of mind.
2. From your computer's terminal, inside the `meal-app` folder:
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```
   This is a one-off (or re-run only if `functions/index.js` changes) — it's not covered by the
   GitHub Actions workflow, which only deploys Hosting.

If a link doesn't import cleanly (some sites don't publish this data, or you've pasted a search/
category page instead of an actual recipe page), the app will tell you and you can fall back to
the manual "Type my own" or "Scan a photo" options instead.

---

## Editing the plan later

- **Change a recipe or add a new one:** edit `data/recipes.json`. No code changes needed —
  the app renders whatever's in there. Commit and push; it redeploys automatically.
- **Change what counts as unsafe:** edit `data/ingredient-rules.json`. `allergens` are hard
  no's (❌); `caution` terms show as a warning (⚠️) rather than a block, which suits FODMAP
  triggers since tolerance is dose-dependent rather than absolute.

## Known limitations

- **Open Food Facts doesn't have every UK product.** When a scan comes back empty, the app
  falls back to letting you paste ingredients in manually.
- **This is a text-match checker, not a medical device.** Always read the actual label if
  there's any doubt, and treat "may contain traces of..." warnings as a separate judgement
  call from confirmed ingredients.
