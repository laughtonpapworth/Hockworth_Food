const calendarDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('calendar') : null;

let CALENDAR = {};
let calendarUnsubscribe = null;

function nextNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(d, iso) {
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (iso === today) return `Today · ${dayMonth}`;
  if (iso === tomorrow) return `Tomorrow · ${dayMonth}`;
  return `${weekday} ${dayMonth}`;
}

// Every recipe currently in the Plan or Saved lists (they're mutually
// exclusive by status, so no de-duplication needed).
function allAssignableRecipes() {
  const plan = typeof planRecipes === 'function' ? planRecipes() : [];
  const saved = typeof savedRecipes === 'function' ? savedRecipes() : [];
  return [...plan, ...saved];
}

function renderCalendar() {
  const container = document.getElementById('calendar-list');
  if (!container) return;
  const recipes = allAssignableRecipes();
  const days = nextNDays(14);

  container.innerHTML = days.map(d => {
    const iso = isoDate(d);
    const assigned = CALENDAR[iso];
    const label = formatDayLabel(d, iso);

    const assignedHtml = assigned
      ? `<div class="cal-assigned"><span>${assigned.title}</span><button type="button" class="cal-remove-btn" data-date="${iso}">✕</button></div>`
      : `<button type="button" class="secondary-btn cal-add-btn" data-date="${iso}">+ Add recipe</button>`;

    const options = recipes.map(r =>
      `<option value="${r.id || r.title}" data-title="${(r.title || '').replace(/"/g, '&quot;')}">${r.title}</option>`
    ).join('');

    return `
      <div class="cal-day">
        <div class="cal-date">${label}</div>
        ${assignedHtml}
        <select class="cal-picker" data-date="${iso}" style="display:none;">
          <option value="">Choose a recipe...</option>
          ${options}
        </select>
      </div>`;
  }).join('');

  container.querySelectorAll('.cal-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      const picker = container.querySelector(`.cal-picker[data-date="${date}"]`);
      btn.style.display = 'none';
      picker.style.display = '';
      picker.focus();
    });
  });

  container.querySelectorAll('.cal-picker').forEach(select => {
    select.addEventListener('change', () => {
      const date = select.dataset.date;
      const opt = select.selectedOptions[0];
      if (!opt || !opt.value) return;
      assignRecipe(date, opt.value, opt.dataset.title);
    });
  });

  container.querySelectorAll('.cal-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeRecipe(btn.dataset.date);
    });
  });
}

function assignRecipe(date, recipeId, title) {
  const ref = calendarDocRef();
  if (!ref) { alert('Sign in first to use the calendar.'); return; }
  ref.set({ [date]: { id: recipeId, title } }, { merge: true }).catch(err => {
    console.error('Could not assign recipe', err);
    alert('Could not save — check your connection and try again.');
  });
}

function removeRecipe(date) {
  const ref = calendarDocRef();
  if (!ref) return;
  ref.update({ [date]: firebase.firestore.FieldValue.delete() }).catch(err => {
    console.error('Could not remove recipe', err);
  });
}

function loadCalendar() {
  const ref = calendarDocRef();
  if (!ref) return;
  if (calendarUnsubscribe) calendarUnsubscribe();
  calendarUnsubscribe = ref.onSnapshot(snap => {
    CALENDAR = snap.exists ? snap.data() : {};
    renderCalendar();
  }, err => console.error('Could not load calendar', err));
}

if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadCalendar(); });
}
