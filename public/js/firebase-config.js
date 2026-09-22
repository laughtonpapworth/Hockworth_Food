// Firebase console > Project settings > General > Your apps > Web app
// Safe to commit — these are public client identifiers, not secrets;
// access is controlled by firestore.rules, not by hiding this file.
const firebaseConfig = {
  apiKey: "AIzaSyCKiNxUucu2GTxUzNcd801CDijP7Blo1qI",
  authDomain: "hockworthfood-1a3eb.firebaseapp.com",
  projectId: "hockworthfood-1a3eb",
  storageBucket: "hockworthfood-1a3eb.firebasestorage.app",
  messagingSenderId: "129385653227",
  appId: "1:129385653227:web:4fc6ef997dd9db13642fae"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const realDb = firebase.firestore();
const functionsClient = firebase.functions();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Calls the server-side recipe importer (see functions/index.js). Needed
// because a browser can't fetch another website's page content directly.
window.mealAppImportRecipe = function (url) {
  return functionsClient.httpsCallable('importRecipe')({ url }).then(res => res.data);
};

window.mealAppAuth = auth;
window.mealAppDb = null; // set once a household is resolved, see below

// Every existing file in this app calls window.mealAppDb.collection('household').doc('x').
// Rather than touching every one of those files, this wrapper quietly redirects that
// exact call to households/{code}/data/x once a household is known, so nothing else
// in the app needs to change to become multi-household.
function makeHouseholdDb(householdId) {
  return {
    collection(name) {
      if (name === 'household') {
        return realDb.collection('households').doc(householdId).collection('data');
      }
      return realDb.collection(name);
    }
  };
}

// --- Auth actions (used by household.js) --------------------------------
window.mealAppGoogleSignIn = function () {
  return auth.signInWithPopup(googleProvider).catch(err => {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      return auth.signInWithRedirect(googleProvider);
    }
    throw err;
  });
};

window.mealAppEmailSignUp = function (email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
};

window.mealAppEmailSignIn = function (email, password) {
  return auth.signInWithEmailAndPassword(email, password);
};

window.mealAppResetPassword = function (email) {
  return auth.sendPasswordResetEmail(email);
};

window.mealAppSignOut = function () {
  return auth.signOut();
};

// Still handle a redirect result in case the popup fallback above was used.
auth.getRedirectResult().catch(err => {
  console.error('Redirect sign-in failed', err);
});

// --- Household actions (used by household.js) ---------------------------
function randomHouseholdCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Points window.mealAppDb at this household. Does NOT touch the screen —
// callers (household.js) decide what the UI does next.
function activateHousehold(householdId) {
  window.mealAppDb = makeHouseholdDb(householdId);
  window.mealAppHouseholdId = householdId;
}
window.mealAppActivateHousehold = activateHousehold;

window.mealAppCreateHousehold = async function () {
  const uid = auth.currentUser.uid;
  let code = randomHouseholdCode();
  for (let i = 0; i < 5; i++) {
    const existing = await realDb.collection('households').doc(code).get();
    if (!existing.exists) break;
    code = randomHouseholdCode();
  }
  await realDb.collection('households').doc(code).set({
    code,
    members: [uid],
    createdAt: Date.now()
  });
  await realDb.collection('users').doc(uid).set({ householdId: code }, { merge: true });
  activateHousehold(code);
  return code;
};

window.mealAppJoinHousehold = async function (code) {
  code = (code || '').trim().toUpperCase();
  if (!code) throw new Error('Enter an invite code first.');
  const uid = auth.currentUser.uid;
  const ref = realDb.collection('households').doc(code);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("That code doesn't match a household. Double check it and try again.");
  await ref.update({ members: firebase.firestore.FieldValue.arrayUnion(uid) });
  await realDb.collection('users').doc(uid).set({ householdId: code }, { merge: true });
  activateHousehold(code);
  return code;
};

// --- Wiring it together --------------------------------------------------
// Fires a 'meal-app-auth' event that household.js listens for, with one of:
//   signed-out      -> show the sign-in screen
//   needs-household -> show the create/join screen
//   ready           -> household resolved, window.mealAppDb is now usable
// This only covers the *natural* sign-in path (a returning user whose
// household is already on file). The create/join screen's own buttons
// (in household.js) handle switching to the app directly once they finish,
// rather than waiting for this listener to re-fire.
auth.onAuthStateChanged(async (user) => {
  window.mealAppDb = null;
  window.mealAppHouseholdId = null;
  if (!user) {
    window.dispatchEvent(new CustomEvent('meal-app-auth', { detail: { state: 'signed-out' } }));
    return;
  }
  let householdId = null;
  try {
    const userDoc = await realDb.collection('users').doc(user.uid).get();
    householdId = userDoc.exists ? userDoc.data().householdId : null;
  } catch (err) {
    console.error('Could not look up household', err);
  }
  if (!householdId) {
    window.dispatchEvent(new CustomEvent('meal-app-auth', { detail: { state: 'needs-household', user } }));
    return;
  }
  activateHousehold(householdId);
  window.dispatchEvent(new CustomEvent('meal-app-auth', { detail: { state: 'ready', user, householdId } }));
});
