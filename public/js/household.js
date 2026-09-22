// Handles the sign-in screen and the household create/join screen, and
// switches between them based on the 'meal-app-auth' event fired by
// firebase-config.js.

function mealAppShowScreen(id) {
  ['signin-screen', 'household-screen', 'app-content'].forEach(sec => {
    const el = document.getElementById(sec);
    if (el) el.style.display = (sec === id) ? '' : 'none';
  });
}

// Each tab's own file (pantry.js, events.js, calendar.js, profiles.js,
// discover.js, app.js) registers its own onAuthStateChanged listener that
// fires as soon as someone is *signed in* — but window.mealAppDb isn't
// usable until their *household* is also resolved, which can happen well
// after sign-in (they might sit on the create/join screen for a minute).
// So once a household is actually ready, explicitly (re)trigger every
// module's initial load here rather than relying on those earlier,
// too-early firings.
function mealAppLoadAllData() {
  if (typeof loadRecipeStatus === 'function') loadRecipeStatus();
  if (typeof loadSavedRecipes === 'function') loadSavedRecipes();
  if (typeof loadCalendar === 'function') loadCalendar();
  if (typeof loadProfiles === 'function') loadProfiles();
  if (typeof loadPantry === 'function') loadPantry();
  if (typeof loadEvents === 'function') loadEvents();
  if (typeof loadEventChecked === 'function') loadEventChecked();
  if (typeof refreshAll === 'function') refreshAll();
}

// Shows the current household's invite code on the Profiles panel, so
// there's always a way to find it again after the one-time setup screen.
function mealAppShowHouseholdCode() {
  const el = document.getElementById('household-panel-code');
  if (el && window.mealAppHouseholdId) el.textContent = window.mealAppHouseholdId;
}

window.addEventListener('meal-app-auth', (e) => {
  const { state, user } = e.detail;
  if (state === 'signed-out') {
    mealAppShowScreen('signin-screen');
  } else if (state === 'needs-household') {
    document.getElementById('household-choice').style.display = '';
    document.getElementById('household-created').style.display = 'none';
    mealAppShowScreen('household-screen');
  } else if (state === 'ready') {
    const badge = document.getElementById('signout-btn');
    if (badge && user) badge.textContent = 'Sign out (' + (user.displayName || user.email) + ')';
    mealAppShowScreen('app-content');
    mealAppShowHouseholdCode();
    mealAppLoadAllData();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const signinError = document.getElementById('signin-error');
  const householdError = document.getElementById('household-error');

  function showSigninError(msg) {
    signinError.style.display = '';
    signinError.textContent = msg;
  }

  // --- Sign-in screen ---
  document.getElementById('google-signin-btn').addEventListener('click', () => {
    signinError.style.display = 'none';
    window.mealAppGoogleSignIn().catch(err => showSigninError('Sign-in failed: ' + err.message));
  });

  let authMode = 'signin'; // or 'signup'
  const modeToggle = document.getElementById('auth-mode-toggle');
  const modeLabel = document.getElementById('auth-mode-label');
  const submitBtn = document.getElementById('email-auth-submit');
  modeToggle.addEventListener('click', (ev) => {
    ev.preventDefault();
    authMode = (authMode === 'signin') ? 'signup' : 'signin';
    submitBtn.textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
    modeLabel.textContent = authMode === 'signin' ? "Don't have an account?" : 'Already have an account?';
    modeToggle.textContent = authMode === 'signin' ? 'Create one' : 'Sign in';
  });

  document.getElementById('email-auth-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    signinError.style.display = 'none';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const action = authMode === 'signin' ? window.mealAppEmailSignIn : window.mealAppEmailSignUp;
    action(email, password).catch(err => showSigninError(err.message));
  });

  document.getElementById('auth-forgot-link').addEventListener('click', (ev) => {
    ev.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return showSigninError('Enter your email above first, then click "Forgot password?"');
    window.mealAppResetPassword(email)
      .then(() => showSigninError('Password reset email sent — check your inbox.'))
      .catch(err => showSigninError(err.message));
  });

  // --- Sign out (button lives in the app header) ---
  document.getElementById('signout-btn').addEventListener('click', () => {
    window.mealAppSignOut();
  });

  // --- Household screen ---
  const createBtn = document.getElementById('create-household-btn');
  createBtn.addEventListener('click', async () => {
    householdError.style.display = 'none';
    createBtn.disabled = true;
    try {
      const code = await window.mealAppCreateHousehold();
      document.getElementById('household-choice').style.display = 'none';
      document.getElementById('household-created').style.display = '';
      document.getElementById('household-code-display').textContent = code;
    } catch (err) {
      householdError.style.display = '';
      householdError.textContent = err.message;
    } finally {
      createBtn.disabled = false;
    }
  });

  // window.mealAppCreateHousehold() already activated the household (set
  // window.mealAppDb) — "Continue" just switches the screen across.
  function enterApp() {
    const badge = document.getElementById('signout-btn');
    const user = window.mealAppAuth.currentUser;
    if (badge && user) badge.textContent = 'Sign out (' + (user.displayName || user.email) + ')';
    mealAppShowScreen('app-content');
    mealAppShowHouseholdCode();
    mealAppLoadAllData();
  }

  // --- Household code panel (inside Profiles) ---
  const copyBtn = document.getElementById('household-copy-btn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const code = document.getElementById('household-panel-code').textContent;
    if (!code || code === '------') return;
    const done = () => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => prompt('Your household code:', code));
    } else {
      prompt('Your household code:', code);
    }
  });

  document.getElementById('household-continue-btn').addEventListener('click', enterApp);

  const joinBtn = document.getElementById('join-household-btn');
  joinBtn.addEventListener('click', async () => {
    householdError.style.display = 'none';
    const code = document.getElementById('join-household-input').value;
    if (!code.trim()) return;
    joinBtn.disabled = true;
    try {
      await window.mealAppJoinHousehold(code);
      enterApp();
    } catch (err) {
      householdError.style.display = '';
      householdError.textContent = err.message;
    } finally {
      joinBtn.disabled = false;
    }
  });
});
