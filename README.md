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

### 3. Enable Google Sign-In
Left sidebar: **Build → Authentication → Get started → Sign-in method → Google → Enable**.
It'll ask for a support email — use either of yours. **Save**.

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

### 8. Restrict access to your two accounts, then deploy the rules
Open `firestore.rules` and replace both placeholder emails with your actual Google account
addresses (the ones you'll each sign in with):
```
'REPLACE_WITH_HIS_EMAIL@gmail.com',
'REPLACE_WITH_HER_EMAIL@gmail.com'
```
Then deploy it — this is a one-off, not handled by the GitHub Action:
```bash
firebase deploy --only firestore:rules
```
Only needs re-running if you ever change `firestore.rules` (e.g. to add a third account later).

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
