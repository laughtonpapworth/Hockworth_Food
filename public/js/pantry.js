let PANTRY = [];

const pantryDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('pantry') : null;

function loadPantry() {
  const ref = pantryDocRef();
  if (!ref) return;
  ref.onSnapshot(snap => {
    PANTRY = (snap.exists && Array.isArray(snap.data().items)) ? snap.data().items : [];
    renderPantry();
    // Pantry items affect what shows on the shopping list, so re-render it.
    if (typeof refreshAll === 'function') refreshAll();
  }, err => console.error('Could not load pantry', err));
}

if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadPantry(); });
}

function savePantry() {
  const ref = pantryDocRef();
  if (!ref) { alert('Sign in first to use the pantry.'); return; }
  ref.set({ items: PANTRY }).catch(err => {
    console.error('Could not save pantry', err);
    alert('Could not save — check your connection and try again.');
  });
}

function renderPantry() {
  const container = document.getElementById('pantry-list');
  if (!container) return;
  container.innerHTML = PANTRY.length
    ? `<div class="card"><div id="pantry-items"></div></div>`
    : '<div class="note">Nothing in your pantry yet — add what you already have stocked, and it\'ll be left off the shopping list automatically.</div>';

  const itemsDiv = document.getElementById('pantry-items');
  if (!itemsDiv) return;
  PANTRY.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'shop-item';
    row.innerHTML = `<span style="flex:1;">${item}</span><button type="button" class="pantry-remove-btn" data-idx="${idx}">Used it up</button>`;
    row.querySelector('.pantry-remove-btn').addEventListener('click', () => {
      PANTRY.splice(idx, 1);
      savePantry();
    });
    itemsDiv.appendChild(row);
  });
}

document.getElementById('pantry-add-btn').addEventListener('click', addPantryItem);
document.getElementById('pantry-add-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPantryItem();
});

function addPantryItem() {
  const input = document.getElementById('pantry-add-input');
  const val = input.value.trim();
  if (!val) return;
  if (!PANTRY.some(i => i.toLowerCase() === val.toLowerCase())) {
    PANTRY.push(val);
    savePantry();
  }
  input.value = '';
}

// Returns true if a shopping-list ingredient line already matches something
// in the pantry (simple substring match, same style as the dislike checker).
function isInPantry(ingredientLine) {
  const lower = ingredientLine.toLowerCase();
  return PANTRY.some(item => lower.includes(item.toLowerCase()));
}
