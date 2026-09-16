const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

document.getElementById('discover-search-btn').addEventListener('click', searchByIngredient);
document.getElementById('discover-ingredient-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchByIngredient();
});
document.getElementById('discover-random-btn').addEventListener('click', fetchRandom);

function setDiscoverStatus(text) {
  document.getElementById('discover-status').textContent = text;
}

async function searchByIngredient() {
  const ingredient = document.getElementById('discover-ingredient-input').value.trim();
  if (!ingredient) return;
  setDiscoverStatus('Searching...');
  document.getElementById('discover-results').innerHTML = '';
  try {
    const res = await fetch(`${MEALDB_BASE}/filter.php?i=${encodeURIComponent(ingredient)}`);
    const data = await res.json();
    if (!data.meals) {
      setDiscoverStatus('No recipes found containing that ingredient — try a simpler term (e.g. "chicken" not "chicken thighs").');
      return;
    }
    // Fetch full detail (ingredients + method) for the first handful of matches.
    const top = data.meals.slice(0, 8);
    const full = await Promise.all(top.map(m => fetchMealDetail(m.idMeal)));
    setDiscoverStatus(`${full.filter(Boolean).length} recipes found — checked against both your restrictions below.`);
    renderDiscoverResults(full.filter(Boolean));
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

async function fetchRandom() {
  setDiscoverStatus('Finding something...');
  document.getElementById('discover-results').innerHTML = '';
  try {
    const res = await fetch(`${MEALDB_BASE}/random.php`);
    const data = await res.json();
    setDiscoverStatus('');
    renderDiscoverResults(data.meals || []);
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
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
  try { await window.rulesReady; } catch { /* checker unavailable, still show recipes without badges */ }

  meals.forEach(meal => {
    const ingredientsList = extractIngredientsList(meal);
    const ingredientsText = ingredientsList.join(', ');
    let badges = '';
    if (typeof checkIngredients === 'function' && window.RULES) {
      try {
        const verdict = checkIngredients(ingredientsText);
        badges = Object.values(verdict).map(r => {
          const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
          return `<span class="badge">${icon} ${r.label}</span>`;
        }).join(' ');
      } catch (e) { console.error(e); }
    }

    const card = document.createElement('div');
    card.className = 'card discover-card';
    card.innerHTML = `
      <div class="discover-card-top">
        <img src="${meal.strMealThumb}" alt="" class="discover-thumb" loading="lazy">
        <div>
          <h3>${meal.strMeal}</h3>
          <div class="meta">${meal.strCategory || ''}${meal.strArea ? ' · ' + meal.strArea : ''}</div>
          <div class="badges">${badges}</div>
        </div>
      </div>
      <div class="details">
        <h4>Ingredients</h4>
        <ul>${ingredientsList.map(i => `<li>${i}</li>`).join('')}</ul>
        <h4>Method</h4>
        <p>${(meal.strInstructions || '').replace(/\r?\n/g, '<br>')}</p>
        <button class="secondary-btn save-recipe-btn">Save to our plan</button>
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
    .then(() => alert(`Saved "${meal.strMeal}" — find it under the Discovered filter on the Recipes tab.`))
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

// Wait for firebase-config.js's auth flow to resolve before subscribing,
// since Firestore rules require a signed-in, allow-listed account.
if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadSavedRecipes(); });
}
