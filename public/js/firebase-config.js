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

// signInWithRedirect is used instead of a popup because popups are
// unreliable inside mobile browsers and installed PWAs (often blocked
// outright). Redirect works everywhere at the cost of a page reload.
document.getElementById('google-signin-btn').addEventListener('click', () => {
  auth.signInWithRedirect(googleProvider);
});

document.getElementById('signout-btn').addEventListener('click', () => {
  auth.signOut();
});

auth.getRedirectResult().catch(err => {
  console.error('Sign-in failed', err);
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
