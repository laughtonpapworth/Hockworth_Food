let EVENTS = {};
let currentViewedEventId = null;
let eventChecked = {};
let eventCheckedUnsub = null;

const eventsDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('events') : null;
const eventCheckedDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('event-shopping-checked') : null;

function loadEventChecked() {
  const ref = eventCheckedDocRef();
  if (!ref) return;
  if (eventCheckedUnsub) eventCheckedUnsub();
  eventCheckedUnsub = ref.onSnapshot(snap => {
    eventChecked = snap.exists ? snap.data() : {};
    if (currentViewedEventId) renderEventDetail(currentViewedEventId);
  }, err => console.error('Could not load event shopping ticks', err));
}

function loadEvents() {
  const ref = eventsDocRef();
  if (!ref) return;
  ref.onSnapshot(snap => {
    EVENTS = (snap.exists && snap.data().list) ? snap.data().list : {};
    renderEventsPicker();
  }, err => console.error('Could not load events', err));
}
if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) { loadEvents(); loadEventChecked(); } });
}

function saveEvent(name, guests, courses) {
  const ref = eventsDocRef();
  if (!ref) { alert('Sign in first to save events.'); return; }
  const id = 'event_' + Date.now();
  const event = { id, name, guests, baseServings: 4, courses, createdAt: Date.now() };
  ref.set({ list: { ...EVENTS, [id]: event } }).catch(err => {
    console.error('Could not save event', err);
    alert('Could not save — check your connection and try again.');
  });
}

function deleteEvent(id) {
  const ref = eventsDocRef();
  if (!ref) return;
  const updated = { ...EVENTS };
  delete updated[id];
  ref.set({ list: updated }).catch(err => console.error('Could not delete event', err));
  const checkedRef = eventCheckedDocRef();
  if (checkedRef) checkedRef.update({ [id]: firebase.firestore.FieldValue.delete() }).catch(() => {});
}

// Best-effort quantity scaling: adjusts a leading number in an ingredient
// line (e.g. "2 tins chickpeas" -> "3 tins chickpeas"). Lines without a
// clean leading number ("Salt to taste", "A pinch of nutmeg") are left as-is
// — free-text ingredients don't have a structured quantity to scale.
function scaleIngredientLine(line, factor) {
  if (!line) return line;
  const match = line.match(/^(\d+\.\d+|\d+)(\s*)/);
  if (!match) return line;
  const qty = parseFloat(match[1]);
  let scaled = Math.round(qty * factor * 10) / 10;
  if (!isFinite(scaled) || scaled <= 0) scaled = qty;
  const rest = line.slice(match[0].length);
  return `${scaled} ${rest}`;
}

function renderEventsPicker() {
  const picker = document.getElementById('events-picker');
  const detail = document.getElementById('event-shopping-detail');
  if (!picker) return;
  const ids = Object.keys(EVENTS);

  if (!ids.length) {
    picker.innerHTML = '';
    detail.innerHTML = '<div class="note">No dinner parties saved yet — build one from Discover → 🎉 Plan a dinner party.</div>';
    return;
  }

  if (!currentViewedEventId || !EVENTS[currentViewedEventId]) currentViewedEventId = ids[0];

  picker.innerHTML = ids.map(id => {
    const ev = EVENTS[id];
    return `<button type="button" class="filter-btn event-chip ${id === currentViewedEventId ? 'active' : ''}" data-id="${id}">${ev.name} (${ev.guests})</button>`;
  }).join('');
  picker.querySelectorAll('.event-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      currentViewedEventId = btn.dataset.id;
      renderEventsPicker();
    });
  });

  renderEventDetail(currentViewedEventId);
}

function renderEventDetail(id) {
  const ev = EVENTS[id];
  const detail = document.getElementById('event-shopping-detail');
  if (!ev) { detail.innerHTML = ''; return; }
  const factor = ev.guests / (ev.baseServings || 4);

  const courseSummaries = Object.values(ev.courses).map(c => {
    if (c.type === 'note') return `<div class="event-course-line">${c.label}: ${c.text ? c.text : '(nothing noted)'}</div>`;
    return `<div class="event-course-line">${c.label}: <strong>${c.title}</strong></div>`;
  }).join('');

  const seen = new Set();
  const items = [];
  Object.values(ev.courses).forEach(c => {
    if (c.type === 'note') {
      if (c.text && c.text.trim()) {
        const key = `${c.label}: ${c.text.trim()}`;
        if (!seen.has(key)) { seen.add(key); items.push(key); }
      }
      return;
    }
    (c.ingredients || []).forEach(line => {
      const scaled = scaleIngredientLine(line, factor);
      if (!seen.has(scaled)) { seen.add(scaled); items.push(scaled); }
    });
  });

  detail.innerHTML = `
    <div class="card event-summary-card">
      <div class="card-body">
        <h3>${ev.name}</h3>
        <div class="meta">${ev.guests} guests · quantities scaled from a base of ${ev.baseServings || 4}</div>
        ${courseSummaries}
        <div class="card-actions">
          <button type="button" class="secondary-btn" id="delete-event-btn">Delete event</button>
        </div>
      </div>
    </div>
    <div class="card"><div id="event-shop-items"></div></div>`;

  document.getElementById('delete-event-btn').addEventListener('click', () => {
    if (confirm(`Delete "${ev.name}"? This can't be undone.`)) {
      deleteEvent(id);
      currentViewedEventId = null;
    }
  });

  const itemsContainer = document.getElementById('event-shop-items');
  const checkedForEvent = eventChecked[id] || {};
  items.forEach(item => {
    const isChecked = !!checkedForEvent[item];
    const row = document.createElement('div');
    row.className = 'shop-item' + (isChecked ? ' checked' : '');
    const boxId = 'event-item-' + Math.random().toString(36).slice(2);
    row.innerHTML = `<input type="checkbox" id="${boxId}" ${isChecked ? 'checked' : ''}><label for="${boxId}"><span>${item}</span></label>`;
    row.querySelector('input').addEventListener('change', e => {
      const ref = eventCheckedDocRef();
      if (!ref) return;
      const current = eventChecked[id] || {};
      current[item] = e.target.checked;
      ref.set({ [id]: current }, { merge: true }).catch(err => console.error('Could not save tick', err));
      row.classList.toggle('checked', e.target.checked);
    });
    itemsContainer.appendChild(row);
  });
}
