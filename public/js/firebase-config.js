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
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

window.mealAppAuth = auth;
window.mealAppDb = db;

const signinScreen = document.getElementById('signin-screen');
const appContent = document.getElementById('app-content');
const signinError = document.getElementById('signin-error');

function showApp(user) {
  signinScreen.style.display = 'none';
  appContent.style.display = '';
  const badge = document.getElementById('signout-btn');
  if (badge) badge.textContent = 'Sign out (' + (user.displayName || user.email) + ')';
}

function showSignIn() {
  signinScreen.style.display = '';
  appContent.style.display = 'none';
}

// signInWithPopup is used here rather than a redirect, because Chrome's
// third-party storage partitioning has been breaking the redirect-based
// flow (it silently returns to the sign-in screen instead of completing).
// Popup avoids that entirely. If the browser blocks the popup outright,
// it falls back to redirect as a second attempt.
document.getElementById('google-signin-btn').addEventListener('click', () => {
  signinError.style.display = 'none';
  auth.signInWithPopup(googleProvider).catch(err => {
    console.error('Popup sign-in failed, trying redirect instead', err);
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      auth.signInWithRedirect(googleProvider);
    } else {
      signinError.style.display = '';
      signinError.textContent = 'Sign-in failed: ' + err.message;
    }
  });
});

document.getElementById('signout-btn').addEventListener('click', () => {
  auth.signOut();
});

// Still handle a redirect result in case the popup fallback above was used.
auth.getRedirectResult().catch(err => {
  console.error('Redirect sign-in failed', err);
  signinError.style.display = '';
  signinError.textContent = 'Sign-in failed: ' + err.message;
});

auth.onAuthStateChanged(user => {
  if (user) {
    showApp(user);
  } else {
    showSignIn();
  }
});
