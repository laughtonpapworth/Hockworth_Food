// ---- Tab navigation ----
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
});

let RECIPES = [];       // built-in recipes from recipes.json — default status 'plan'
let DISCOVERED = [];    // saved-from-Discover recipes — default status 'saved'
let STATUS = {};        // Firestore overrides: { [recipeId]: 'plan' | 'saved' }

// A built-in recipe is 'plan' unless explicitly overridden to 'saved'.
// A discovered recipe is 'saved' unless explicitly promoted to 'plan'.
function getStatus(r) {
  const override = STATUS[r.id || r.title];
  if (r.type === 'discovered') return override === 'plan' ? 'plan' : 'saved';
  return override === 'saved' ? 'saved' : 'plan';
}

function planRecipes() {
  return [...RECIPES, ...DISCOVERED].filter(r => getStatus(r) === 'plan');
}
function savedRecipes() {
  return [...RECIPES, ...DISCOVERED].filter(r => getStatus(r) === 'saved');
}

function refreshAll() {
  const activeFilter = document.querySelector('.filter-btn.active');
  renderRecipes(activeFilter ? activeFilter.dataset.filter : 'all');
  renderSaved();
  renderShoppingList(planRecipes());
}

function mergeDiscoveredRecipes(discovered) {
  DISCOVERED = discovered;
  refreshAll();
}

// ---- Recipe status sync (which recipes are in the Plan vs Saved) ----
const statusDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('recipe-status') : null;

function setStatus(recipeId, status) {
  const ref = statusDocRef();
  if (!ref) { alert('Sign in first to change the plan.'); return; }
  ref.set({ [recipeId]: status }, { merge: true }).catch(err => {
    console.error('Could not update status', err);
    alert('Could not save that change — check your connection and try again.');
  });
}

function deleteDiscovered(recipeId) {
  // recipeId looks like "discovered-<mealId>" — the underlying saved-recipes
  // doc is keyed by the bare mealId.
  const mealId = recipeId.replace(/^discovered-/, '');
  const ref = window.mealAppDb ? window.mealAppDb.collection('household').doc('saved-recipes') : null;
  if (!ref) { alert('Sign in first to delete recipes.'); return; }
  ref.update({ [mealId]: firebase.firestore.FieldValue.delete() }).catch(err => {
    console.error('Delete failed', err);
    alert('Could not delete — check your connection and try again.');
  });
}

function loadRecipeStatus() {
  if (!window.mealAppDb) return;
  window.mealAppDb.collection('household').doc('recipe-status').onSnapshot(snap => {
    STATUS = snap.exists ? snap.data() : {};
    refreshAll();
  }, err => console.error('Could not load recipe status', err));
}
if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadRecipeStatus(); });
}

// ---- Load built-in recipes ----
fetch('data/recipes.json')
  .then(r => r.json())
  .then(data => {
    RECIPES = data;
    refreshAll();
  })
  .catch(err => {
    document.getElementById('recipe-list').innerHTML =
      '<div class="note">Could not load recipes.json — if you opened this file directly (file://), run a local server instead, e.g. <code>npx serve public</code>.</div>';
    console.error(err);
  });

// ---- Recipe filtering (Plan tab) ----
document.querySelectorAll('.filter-btn:not(.category-chip)').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#recipes .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRecipes(btn.dataset.filter);
  });
});

function renderRecipes(filter) {
  const list = document.getElementById('recipe-list');
  const items = filter === 'all' ? planRecipes() : planRecipes().filter(r => r.type === filter);
  list.innerHTML = items.length
    ? items.map(r => recipeCardHtml(r, 'plan')).join('')
    : '<div class="note">Nothing here — add something from Discover, or check Saved.</div>';
  wireCardEvents(list);
}

function renderSaved() {
  const list = document.getElementById('saved-list');
  if (!list) return;
  const items = savedRecipes();
  list.innerHTML = items.length
    ? items.map(r => recipeCardHtml(r, 'saved')).join('')
    : '<div class="note">Nothing saved yet — recipes you remove from the plan, or save from Discover, land here.</div>';
  wireCardEvents(list);
}

function wireCardEvents(container) {
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-action-btn')) return;
      card.classList.toggle('expanded');
    });
  });
  container.querySelectorAll('.remove-from-plan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setStatus(btn.dataset.id, 'saved');
    });
  });
  container.querySelectorAll('.add-to-plan-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setStatus(btn.dataset.id, 'plan');
    });
  });
  container.querySelectorAll('.delete-recipe-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Delete this recipe permanently?')) deleteDiscovered(btn.dataset.id);
    });
  });
}

function recipeCardHtml(r, context) {
  const id = r.id || r.title;
  const actionBtn = context === 'plan'
    ? `<button class="secondary-btn card-action-btn remove-from-plan-btn" data-id="${id}">Remove from plan</button>`
    : `<button class="secondary-btn card-action-btn add-to-plan-btn" data-id="${id}">Add to plan</button>` +
      (r.type === 'discovered' ? `<button class="secondary-btn card-action-btn delete-recipe-btn" data-id="${id}">Delete</button>` : '');

  if (r.type === 'discovered') {
    return `
      <div class="card">
        ${r.thumb ? `<img src="${r.thumb}" alt="" class="discover-thumb-wide" loading="lazy">` : ''}
        <div class="card-body">
          <h3>${r.title}</h3>
          <div class="meta">Saved from Discover</div>
          <div class="tag">discovered</div>
          <div class="details">
            <h4>Ingredients</h4>
            <ul>${(r.ingredients || []).map(i => `<li>${i}</li>`).join('')}</ul>
            <h4>Method</h4>
            <p>${(r.instructionsText || '').replace(/\r?\n/g, '<br>')}</p>
            <div class="card-actions">${actionBtn}</div>
          </div>
        </div>
      </div>`;
  }

  const daysText = (r.days || []).join(', ');
  let body = '';

  if (r.type === 'swap') {
    body += `<h4>Shared base</h4><ul>${(r.baseIngredients || []).map(i => `<li>${i}</li>`).join('')}</ul>`;
    if (r.instructions) {
      body += `<h4>Method (base)</h4><ol>${r.instructions.map(i => `<li>${i}</li>`).join('')}</ol>`;
    }
    body += `<div class="who his"><strong>His: ${r.variants.his.protein}</strong><ol>${r.variants.his.instructions.map(i => `<li>${i}</li>`).join('')}</ol></div>`;
    body += `<div class="who hers"><strong>Her: ${r.variants.hers.protein}</strong><ol>${r.variants.hers.instructions.map(i => `<li>${i}</li>`).join('')}</ol></div>`;
  } else {
    body += `<h4>Ingredients</h4><ul>${(r.ingredients || []).map(i => `<li>${i}</li>`).join('')}</ul>`;
    body += `<h4>Method</h4><ol>${(r.instructions || []).map(i => `<li>${i}</li>`).join('')}</ol>`;
  }

  const personTag = r.person ? ` · ${r.person === 'his' ? 'His' : 'Her'}` : '';

  return `
    <div class="card">
      <div class="card-body">
        <h3>${r.title}</h3>
        <div class="meta">Serves ${r.servings} · ${r.prepMinutes} min prep · ${r.cookMinutes} min cook${personTag}</div>
        <div class="tag">${r.type}</div>
        ${daysText ? `<div class="meta">${daysText}</div>` : ''}
        <div class="details">${body}<div class="card-actions">${actionBtn}</div></div>
      </div>
    </div>`;
}

// ---- Shopping list (synced across devices via Firestore, falls back to localStorage) ----
// Only recipes currently in the Plan feed the shopping list — Saved recipes
// are a holding pen and never contribute ingredients automatically.
function collectItems(recipes) {
  const seen = new Set();
  const items = [];
  recipes.forEach(r => {
    const all = [...(r.ingredients || []), ...(r.baseIngredients || [])];
    if (r.variants) {
      all.push(r.variants.his.protein, r.variants.hers.protein);
    }
    all.forEach(i => {
      const key = i.trim();
      if (!seen.has(key)) { seen.add(key); items.push(key); }
    });
  });
  return items;
}

const shoppingDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('shopping-list') : null;

let shoppingUnsubscribe = null;

function renderShoppingList(recipes) {
  const items = collectItems(recipes);
  const list = document.getElementById('shopping-list');
  list.innerHTML = `<div class="card"><div id="shop-items"></div></div>`;
  const container = document.getElementById('shop-items');

  function draw(checkedMap) {
    container.innerHTML = '';
    items.forEach((item, idx) => {
      const id = 'item-' + idx;
      const row = document.createElement('div');
      row.className = 'shop-item' + (checkedMap[item] ? ' checked' : '');
      row.innerHTML = `<input type="checkbox" id="${id}" ${checkedMap[item] ? 'checked' : ''}><label for="${id}"><span>${item}</span></label>`;
      row.querySelector('input').addEventListener('change', e => {
        setChecked(item, e.target.checked);
      });
      container.appendChild(row);
    });
  }

  function setChecked(item, value) {
    const ref = shoppingDocRef();
    if (ref) {
      ref.set({ [item]: value }, { merge: true }).catch(err => {
        console.error('Sync failed, saving locally instead', err);
        localFallbackSet(item, value);
        draw(localFallbackGet());
      });
    } else {
      localFallbackSet(item, value);
      draw(localFallbackGet());
    }
  }

  function localFallbackGet() {
    return JSON.parse(localStorage.getItem('shoppingChecked') || '{}');
  }
  function localFallbackSet(item, value) {
    const state = localFallbackGet();
    state[item] = value;
    localStorage.setItem('shoppingChecked', JSON.stringify(state));
  }

  if (shoppingUnsubscribe) { shoppingUnsubscribe(); shoppingUnsubscribe = null; }

  const ref = shoppingDocRef();
  if (ref) {
    shoppingUnsubscribe = ref.onSnapshot(
      snap => draw(snap.exists ? snap.data() : {}),
      err => {
        console.error('Firestore listener failed, falling back to local storage', err);
        draw(localFallbackGet());
      }
    );
  } else {
    draw(localFallbackGet());
  }
}

document.getElementById('reset-shopping').addEventListener('click', () => {
  const ref = shoppingDocRef();
  if (ref) {
    ref.delete().catch(err => console.error('Reset sync failed', err));
  }
  localStorage.removeItem('shoppingChecked');
});
