const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

document.getElementById('discover-search-btn').addEventListener('click', searchByIngredient);
document.getElementById('discover-ingredient-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchByIngredient();
});
document.getElementById('discover-random-btn').addEventListener('click', fetchRandomBatch);

function setDiscoverStatus(text) {
  document.getElementById('discover-status').textContent = text;
}

// ---- Category chips ----
fetch(`${MEALDB_BASE}/categories.php`)
  .then(r => r.json())
  .then(data => {
    const categories = (data.categories || []).filter(c => c.strCategory !== 'Beef');
    const chipRow = document.getElementById('category-chips');
    chipRow.innerHTML = categories.map(c =>
      `<button class="filter-btn category-chip" data-category="${c.strCategory}">${c.strCategory}</button>`
    ).join('');
    chipRow.querySelectorAll('.category-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        chipRow.querySelectorAll('.category-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        searchByCategory(btn.dataset.category);
      });
    });
  })
  .catch(err => console.error('Could not load categories', err));

async function searchByCategory(category) {
  setDiscoverStatus('Loading ' + category + ' recipes...');
  document.getElementById('discover-results').innerHTML = '';
  try {
    const res = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`);
    const data = await res.json();
    if (!data.meals) { setDiscoverStatus('Nothing found in that category.'); return; }
    const top = data.meals.slice(0, 12);
    const full = await Promise.all(top.map(m => fetchMealDetail(m.idMeal)));
    const results = full.filter(Boolean);
    setDiscoverStatus(`${results.length} ${category} recipes — checked against both your restrictions.`);
    renderDiscoverResults(results);
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

async function searchByIngredient() {
  const ingredient = document.getElementById('discover-ingredient-input').value.trim();
  if (!ingredient) return;
  clearCategoryChips();
  setDiscoverStatus('Searching...');
  document.getElementById('discover-results').innerHTML = '';
  try {
    const res = await fetch(`${MEALDB_BASE}/filter.php?i=${encodeURIComponent(ingredient)}`);
    const data = await res.json();
    if (!data.meals) {
      setDiscoverStatus('No recipes found containing that ingredient — try a simpler term (e.g. "chicken" not "chicken thighs").');
      return;
    }
    const top = data.meals.slice(0, 12);
    const full = await Promise.all(top.map(m => fetchMealDetail(m.idMeal)));
    const results = full.filter(Boolean);
    setDiscoverStatus(`${results.length} recipes found — checked against both your restrictions below.`);
    renderDiscoverResults(results);
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

// Fetches a genuine batch of different random recipes (TheMealDB's random
// endpoint only ever returns one at a time, so this fires several requests
// in parallel and de-duplicates the results).
async function fetchRandomBatch() {
  clearCategoryChips();
  setDiscoverStatus('Finding some ideas...');
  document.getElementById('discover-results').innerHTML = '';
  try {
    const calls = Array.from({ length: 12 }, () => fetch(`${MEALDB_BASE}/random.php`).then(r => r.json()));
    const results = await Promise.all(calls);
    const seen = new Set();
    const meals = [];
    results.forEach(r => {
      const meal = r.meals && r.meals[0];
      if (meal && !seen.has(meal.idMeal)) { seen.add(meal.idMeal); meals.push(meal); }
    });
    setDiscoverStatus(`${meals.length} ideas — checked against both your restrictions below.`);
    renderDiscoverResults(meals);
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

function clearCategoryChips() {
  document.querySelectorAll('.category-chip').forEach(b => b.classList.remove('active'));
}

async function fetchMealDetail(id) {
  try {
    const res = await fetch(`${MEALDB_BASE}/lookup.php?i=${id}`);
    const data = await res.json();
    return data.meals ? data.meals[0] : null;
  } catch {
    return null;
  }
}

function extractIngredientsList(meal) {
  const parts = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal['strIngredient' + i];
    const measure = meal['strMeasure' + i];
    if (ing && ing.trim()) parts.push(`${measure && measure.trim() ? measure.trim() + ' ' : ''}${ing.trim()}`);
  }
  return parts;
}

async function renderDiscoverResults(meals) {
  const container = document.getElementById('discover-results');
  container.innerHTML = '';
  try { await window.rulesReady; } catch { /* still show recipes without badges */ }

  meals.forEach(meal => {
    const ingredientsList = extractIngredientsList(meal);
    const ingredientsText = ingredientsList.join(', ');
    let badges = '';
    if (typeof checkIngredients === 'function' && window.RULES) {
      try {
        const verdict = checkIngredients(ingredientsText);
        badges = Object.values(verdict).map(r => {
          const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
          const cls = r.status === 'ok' ? 'badge-ok' : r.status === 'warn' ? 'badge-warn' : 'badge-bad';
          return `<span class="badge ${cls}">${icon} ${r.label}</span>`;
        }).join('');
      } catch (e) { console.error(e); }
    }
    if (/\bbeef\b/i.test(ingredientsText)) {
      badges += `<span class="badge badge-note">🥩 Contains beef</span>`;
    }

    const card = document.createElement('div');
    card.className = 'card discover-card';
    card.innerHTML = `
      <img src="${meal.strMealThumb}" alt="" class="discover-thumb-wide" loading="lazy">
      <div class="card-body">
        <h3>${meal.strMeal}</h3>
        <div class="meta">${meal.strCategory || ''}${meal.strArea ? ' · ' + meal.strArea : ''}</div>
        <div class="badges">${badges}</div>
        <div class="details">
          <h4>Ingredients</h4>
          <ul>${ingredientsList.map(i => `<li>${i}</li>`).join('')}</ul>
          <h4>Method</h4>
          <p>${(meal.strInstructions || '').replace(/\r?\n/g, '<br>')}</p>
          <button class="secondary-btn save-recipe-btn">Save to our plan</button>
        </div>
      </div>`;

    card.addEventListener('click', e => {
      if (e.target.classList.contains('save-recipe-btn')) return;
      card.classList.toggle('expanded');
    });
    card.querySelector('.save-recipe-btn').addEventListener('click', e => {
      e.stopPropagation();
      saveDiscoveredRecipe(meal, ingredientsList);
    });
    container.appendChild(card);
  });
}

function saveDiscoveredRecipe(meal, ingredientsList) {
  const ref = window.mealAppDb ? window.mealAppDb.collection('household').doc('saved-recipes') : null;
  if (!ref) {
    alert('Sign in first so this can save to your shared plan.');
    return;
  }
  const record = {
    title: meal.strMeal,
    source: 'TheMealDB',
    thumb: meal.strMealThumb,
    ingredients: ingredientsList,
    instructions: meal.strInstructions || '',
    savedAt: Date.now()
  };
  ref.set({ [meal.idMeal]: record }, { merge: true })
    .then(() => alert(`Saved "${meal.strMeal}" — find it under the Saved filter on the Plan tab.`))
    .catch(err => {
      console.error(err);
      alert('Could not save — check your connection and try again.');
    });
}

// ---- Merge saved/discovered recipes into the main Recipes tab ----
function loadSavedRecipes() {
  if (!window.mealAppDb) return;
  window.mealAppDb.collection('household').doc('saved-recipes').onSnapshot(snap => {
    const saved = snap.exists ? snap.data() : {};
    const discovered = Object.entries(saved).map(([id, r]) => ({
      id: 'discovered-' + id,
      title: r.title,
      type: 'discovered',
      thumb: r.thumb,
      ingredients: r.ingredients,
      instructionsText: r.instructions,
      servings: 4,
      prepMinutes: '?',
      cookMinutes: '?'
    }));
    if (typeof mergeDiscoveredRecipes === 'function') {
      mergeDiscoveredRecipes(discovered);
    }
  }, err => console.error('Could not load saved recipes', err));
}

if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadSavedRecipes(); });
}
