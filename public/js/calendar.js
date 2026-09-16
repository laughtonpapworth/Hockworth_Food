const calendarDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('calendar') : null;

let CALENDAR = {};
let calendarUnsubscribe = null;

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth(); // 0-indexed

function isoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Parsed with an explicit time to avoid the UTC-midnight/local-timezone
// off-by-one-day bug that "new Date('YYYY-MM-DD')" alone can cause.
function parseIso(iso) {
  return new Date(iso + 'T00:00:00');
}

// ---- Month grid rendering ----
function renderCalendar() {
  const container = document.getElementById('calendar-list');
  if (!container) return;

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first week
  const todayIso = isoDate(today);

  let cells = '';
  for (let i = 0; i < leadingBlanks; i++) cells += `<div class="cal-cell cal-empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(viewYear, viewMonth, day);
    const iso = isoDate(d);
    const assigned = CALENDAR[iso];
    const classes = ['cal-cell'];
    if (iso === todayIso) classes.push('cal-today');
    if (assigned) classes.push('cal-has-recipe');
    cells += `
      <div class="${classes.join(' ')}" data-date="${iso}">
        <div class="cal-daynum">${day}</div>
        ${assigned ? `<div class="cal-cell-title">${assigned.title}</div>` : ''}
      </div>`;
  }

  const trailingBlanks = (7 - ((leadingBlanks + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailingBlanks; i++) cells += `<div class="cal-cell cal-empty"></div>`;

  container.innerHTML = `
    <div class="cal-header">
      <button type="button" class="cal-nav-btn" id="cal-prev">‹</button>
      <div class="cal-month-label">${monthLabel}</div>
      <button type="button" class="cal-nav-btn" id="cal-next">›</button>
    </div>
    <div class="cal-weekdays"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>
    <div class="cal-grid">${cells}</div>`;

  document.getElementById('cal-prev').addEventListener('click', () => changeMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => changeMonth(1));
  container.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => openDayModal(cell.dataset.date));
  });
}

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
}

// ---- Day detail popup ----
function openDayModal(iso) {
  const assigned = CALENDAR[iso];
  const label = parseIso(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!assigned) {
    showModal(`
      <h3>${label}</h3>
      <p class="muted">Nothing planned for this day yet. Add a recipe from the Plan tab and choose this date from there.</p>
      <div class="card-actions" style="margin-top:14px;">
        <button class="secondary-btn" id="modal-close-btn">Close</button>
      </div>`);
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    return;
  }

  showModal(`
    <h3>${label}</h3>
    <p class="cal-modal-title">${assigned.title}</p>
    <div class="card-actions">
      <button class="primary-btn" id="modal-view-recipe-btn">View recipe</button>
      <button class="secondary-btn" id="modal-remove-day-btn">Remove</button>
    </div>`);
  document.getElementById('modal-view-recipe-btn').addEventListener('click', () => {
    closeModal();
    goToRecipeInPlan(assigned.id, assigned.title);
  });
  document.getElementById('modal-remove-day-btn').addEventListener('click', () => {
    removeRecipe(iso);
    closeModal();
  });
}

// ---- Date-picker popup, launched from a recipe card's "Add to calendar" button ----
function openDatePickerModal(recipeId, title) {
  const defaultDate = isoDate(today);
  showModal(`
    <h3>Add to calendar</h3>
    <p class="cal-modal-title">${title}</p>
    <label for="modal-date-input" class="muted" style="display:block; margin:12px 0 6px;">Choose a day</label>
    <input type="date" id="modal-date-input" value="${defaultDate}" min="${defaultDate}">
    <div class="card-actions" style="margin-top:16px;">
      <button class="primary-btn" id="modal-confirm-btn">Add</button>
      <button class="secondary-btn" id="modal-cancel-btn">Cancel</button>
    </div>`);
  document.getElementById('modal-confirm-btn').addEventListener('click', () => {
    const date = document.getElementById('modal-date-input').value;
    if (!date) return;
    assignRecipe(date, recipeId, title);
    closeModal();
  });
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
}

// ---- Jump to the Plan tab and highlight the matching recipe ----
function goToRecipeInPlan(recipeId, title) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const planNavBtn = document.querySelector('.nav-btn[data-tab="recipes"]');
  if (planNavBtn) planNavBtn.classList.add('active');
  document.getElementById('recipes').classList.add('active');

  document.querySelectorAll('#recipes .filter-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('#recipes .filter-btn[data-filter="all"]');
  if (allBtn) allBtn.classList.add('active');
  if (typeof renderRecipes === 'function') renderRecipes('all');

  setTimeout(() => {
    const card = document.querySelector(`#recipe-list .card[data-recipe-id="${CSS.escape(recipeId)}"]`);
    if (card) {
      card.classList.add('expanded', 'cal-highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => card.classList.remove('cal-highlight'), 1600);
    } else {
      alert(`"${title}" isn't currently in the Plan — it may have been removed, or only exists in Saved.`);
    }
  }, 50);
}

// ---- Firestore actions ----
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
