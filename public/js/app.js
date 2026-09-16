// ---- Tab navigation ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

let RECIPES = [];

// ---- Load recipes ----
fetch('data/recipes.json')
  .then(r => r.json())
  .then(data => {
    RECIPES = data;
    renderRecipes('all');
    renderShoppingList(data);
  })
  .catch(err => {
    document.getElementById('recipe-list').innerHTML =
      '<div class="note">Could not load recipes.json — if you opened this file directly (file://), run a local server instead, e.g. <code>npx serve public</code>.</div>';
    console.error(err);
  });

// ---- Recipe filtering ----
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRecipes(btn.dataset.filter);
  });
});

function renderRecipes(filter) {
  const list = document.getElementById('recipe-list');
  const items = filter === 'all' ? RECIPES : RECIPES.filter(r => r.type === filter);
  list.innerHTML = items.map(recipeCardHtml).join('');
  list.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('expanded'));
  });
}

function recipeCardHtml(r) {
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
      <h3>${r.title}</h3>
      <div class="meta">Serves ${r.servings} · ${r.prepMinutes} min prep · ${r.cookMinutes} min cook${personTag}</div>
      <div class="tag">${r.type}</div>
      ${daysText ? `<div class="meta">${daysText}</div>` : ''}
      <div class="details">${body}</div>
    </div>`;
}

// ---- Shopping list (synced across devices via Firestore, falls back to localStorage) ----
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
    // Live sync: fires immediately with current state, then again whenever
    // either device changes it — this is what makes both phones stay in sync.
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
