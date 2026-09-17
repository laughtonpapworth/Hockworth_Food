const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

let selectedProfileIds = [];

// ---- Profile selector (who am I finding food for?) ----
function renderDiscoverProfileSelector() {
  const el = document.getElementById('discover-profile-select');
  if (!el) return;
  const profiles = typeof getProfiles === 'function' ? getProfiles() : [];
  if (!profiles.length) {
    el.innerHTML = '<div class="note">Set up a profile first (the ⚙️ icon in the header) to find recipes for specific people.</div>';
    return;
  }
  // Default to everyone selected; drop any stale ids for deleted profiles.
  selectedProfileIds = selectedProfileIds.filter(id => profiles.some(p => p.id === id));
  if (!selectedProfileIds.length) selectedProfileIds = profiles.map(p => p.id);

  el.innerHTML = `<span class="profile-select-label">Find for:</span>` +
    profiles.map(p =>
      `<button type="button" class="filter-btn profile-chip ${selectedProfileIds.includes(p.id) ? 'active' : ''}" data-id="${p.id}">${p.name}</button>`
    ).join('');

  el.querySelectorAll('.profile-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (selectedProfileIds.includes(id)) {
        if (selectedProfileIds.length > 1) selectedProfileIds = selectedProfileIds.filter(x => x !== id);
      } else {
        selectedProfileIds.push(id);
      }
      renderDiscoverProfileSelector();
    });
  });
}

function getSelectedDiscoverProfiles() {
  const profiles = typeof getProfiles === 'function' ? getProfiles() : [];
  return profiles.filter(p => selectedProfileIds.includes(p.id));
}

// Filters a list of {meal, ingredientsList} entries down to ones that are
// safe (not 'avoid') for every currently-selected profile.
function filterSafeForSelected(entries) {
  const profiles = getSelectedDiscoverProfiles();
  if (!profiles.length || !window.RULES) return entries;
  return entries.filter(({ ingredientsText }) => {
    const verdict = checkIngredientsForProfiles(ingredientsText, profiles);
    return Object.values(verdict).every(v => v.status !== 'avoid');
  });
}

document.getElementById('discover-search-btn').addEventListener('click', searchByIngredient);
document.getElementById('discover-ingredient-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchByIngredient();
});
document.getElementById('discover-random-btn').addEventListener('click', fetchRandomBatch);

function setDiscoverStatus(text) {
  document.getElementById('discover-status').textContent = text;
}

// ---- Category / Area dropdowns ----
fetch(`${MEALDB_BASE}/categories.php`)
  .then(r => r.json())
  .then(data => {
    const select = document.getElementById('category-select');
    (data.categories || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.strCategory;
      opt.textContent = c.strCategory;
      select.appendChild(opt);
    });
  })
  .catch(err => console.error('Could not load categories', err));

fetch(`${MEALDB_BASE}/list.php?a=list`)
  .then(r => r.json())
  .then(data => {
    const select = document.getElementById('area-select');
    (data.meals || []).forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.strArea;
      opt.textContent = a.strArea;
      select.appendChild(opt);
    });
  })
  .catch(err => console.error('Could not load areas', err));

document.getElementById('category-select').addEventListener('change', function () {
  if (this.value) { document.getElementById('area-select').value = ''; searchByFilter('c', this.value); }
});
document.getElementById('area-select').addEventListener('change', function () {
  if (this.value) { document.getElementById('category-select').value = ''; searchByFilter('a', this.value); }
});

async function searchByFilter(param, value) {
  setDiscoverStatus(`Loading ${value} recipes...`);
  document.getElementById('discover-results').innerHTML = '';
  try {
    const res = await fetch(`${MEALDB_BASE}/filter.php?${param}=${encodeURIComponent(value)}`);
    const data = await res.json();
    if (!data.meals) { setDiscoverStatus('Nothing found.'); return; }
    await fetchAndRender(data.meals.slice(0, 12), value);
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

async function searchByIngredient() {
  const ingredient = document.getElementById('discover-ingredient-input').value.trim();
  if (!ingredient) return;
  document.getElementById('category-select').value = '';
  document.getElementById('area-select').value = '';
  setDiscoverStatus('Searching...');
  document.getElementById('discover-results').innerHTML = '';
  try {
    const res = await fetch(`${MEALDB_BASE}/filter.php?i=${encodeURIComponent(ingredient)}`);
    const data = await res.json();
    if (!data.meals) {
      setDiscoverStatus('No recipes found containing that ingredient — try a simpler term (e.g. "chicken" not "chicken thighs").');
      return;
    }
    await fetchAndRender(data.meals.slice(0, 12));
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

async function fetchRandomBatch() {
  document.getElementById('category-select').value = '';
  document.getElementById('area-select').value = '';
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
    await fetchAndRender(meals.map(m => ({ idMeal: m.idMeal })), null, meals);
  } catch (err) {
    console.error(err);
    setDiscoverStatus('Search failed — check your connection and try again.');
  }
}

async function fetchAndRender(stubs, contextLabel, alreadyFull) {
  const full = alreadyFull || (await Promise.all(stubs.map(m => fetchMealDetail(m.idMeal)))).filter(Boolean);
  try { await window.rulesReady; } catch { /* still show recipes without filtering */ }

  const entries = full.map(meal => ({
    meal,
    ingredientsList: extractIngredientsList(meal),
    ingredientsText: extractIngredientsList(meal).join(', ')
  }));

  const safe = filterSafeForSelected(entries);
  const names = getSelectedDiscoverProfiles().map(p => p.name).join(', ');
  setDiscoverStatus(`${safe.length} of ${entries.length} recipes${contextLabel ? ' (' + contextLabel + ')' : ''} are safe for ${names || 'your selection'}.`);
  renderDiscoverResults(safe);
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

function badgesForIngredients(ingredientsText) {
  const profiles = getSelectedDiscoverProfiles();
  if (!(typeof checkIngredientsForProfiles === 'function' && window.RULES && profiles.length)) return '';
  try {
    const verdict = checkIngredientsForProfiles(ingredientsText, profiles);
    return Object.values(verdict).map(r => {
      const icon = r.status === 'ok' ? '✅' : r.status === 'caution' ? '⚠️' : '❌';
      const cls = r.status === 'ok' ? 'badge-ok' : r.status === 'caution' ? 'badge-warn' : 'badge-bad';
      const star = r.likeHit ? ' ⭐' : '';
      return `<span class="badge ${cls}">${icon} ${r.name}${star}</span>`;
    }).join('');
  } catch (e) { console.error(e); return ''; }
}

function renderDiscoverResults(entries) {
  const container = document.getElementById('discover-results');
  container.innerHTML = '';
  entries.forEach(({ meal, ingredientsList, ingredientsText }) => {
    const card = document.createElement('div');
    card.className = 'card discover-card';
    card.innerHTML = `
      <img src="${meal.strMealThumb}" alt="" class="discover-thumb-wide" loading="lazy">
      <div class="card-body">
        <h3>${meal.strMeal}</h3>
        <div class="meta">${meal.strCategory || ''}${meal.strArea ? ' · ' + meal.strArea : ''}</div>
        <div class="badges">${badgesForIngredients(ingredientsText)}</div>
        <div class="details">
          <h4>Ingredients</h4>
          <ul>${ingredientsList.map(i => `<li>${i}</li>`).join('')}</ul>
          <h4>Method</h4>
          <p>${(meal.strInstructions || '').replace(/\r?\n/g, '<br>')}</p>
        </div>
        <div class="card-actions">
          <button class="secondary-btn card-action-btn add-plan-btn">Add to plan</button>
          <button class="secondary-btn card-action-btn add-saved-btn">Add to saved</button>
          <button class="secondary-btn card-action-btn discover-cook-btn">👨‍🍳 Cook mode</button>
        </div>
      </div>`;

    card.addEventListener('click', e => {
      if (e.target.closest('.card-action-btn')) return;
      card.classList.toggle('expanded');
    });
    card.querySelector('.add-plan-btn').addEventListener('click', e => {
      e.stopPropagation();
      saveDiscoveredRecipe(meal, ingredientsList, 'plan');
    });
    card.querySelector('.add-saved-btn').addEventListener('click', e => {
      e.stopPropagation();
      saveDiscoveredRecipe(meal, ingredientsList, 'saved');
    });
    card.querySelector('.discover-cook-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (typeof openCookMode === 'function') openCookMode(splitIntoSteps(meal.strInstructions), meal.strMeal);
    });
    container.appendChild(card);
  });
}

function saveDiscoveredRecipe(meal, ingredientsList, targetStatus) {
  const ref = window.mealAppDb ? window.mealAppDb.collection('household').doc('saved-recipes') : null;
  if (!ref) { alert('Sign in first so this can save to your shared plan.'); return; }
  const record = {
    title: meal.strMeal, source: 'TheMealDB', thumb: meal.strMealThumb,
    ingredients: ingredientsList, instructions: meal.strInstructions || '', savedAt: Date.now()
  };
  ref.set({ [meal.idMeal]: record }, { merge: true })
    .then(() => {
      if (targetStatus === 'plan' && typeof setStatus === 'function') {
        setStatus('discovered-' + meal.idMeal, 'plan');
      }
      alert(`Added "${meal.strMeal}" — find it on ${targetStatus === 'plan' ? 'the Plan tab' : 'the Saved tab'}.`);
    })
    .catch(err => { console.error(err); alert('Could not save — check your connection and try again.'); });
}

// ---- Meal planner (course builder) ----
const COURSE_CATEGORY_MAP = {
  starter: ['Starter'],
  main: ['Chicken', 'Beef', 'Pork', 'Seafood', 'Pasta', 'Vegetarian', 'Vegan', 'Lamb', 'Miscellaneous', 'Goat'],
  dessert: ['Dessert']
};
let plannerCourseCount = 2;

document.querySelectorAll('.course-count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.course-count-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    plannerCourseCount = parseInt(btn.dataset.count, 10);
  });
});

document.getElementById('build-meal-btn').addEventListener('click', buildMeal);

function setPlannerStatus(text) {
  document.getElementById('meal-planner-status').textContent = text;
}

async function buildMeal() {
  const profiles = getSelectedDiscoverProfiles();
  if (!profiles.length) { alert('Select at least one person above first.'); return; }
  try { await window.rulesReady; } catch {}

  const courses = plannerCourseCount === 3 ? ['starter', 'main', 'dessert'] : ['starter', 'main'];
  document.getElementById('meal-planner-results').innerHTML = '';

  for (const course of courses) {
    setPlannerStatus(`Finding your ${course}...`);
    const outcome = await findCourseRecipe(course, profiles);
    renderCourseResult(course, outcome);
  }
  setPlannerStatus('Done — add anything you like to your plan or saved list below.');
}

async function findCourseRecipe(course, profiles) {
  const pool = COURSE_CATEGORY_MAP[course];

  for (let attempt = 0; attempt < 10; attempt++) {
    const category = pool[Math.floor(Math.random() * pool.length)];
    const found = await tryRandomFromCategory(category, profiles);
    if (found) return { type: 'shared', ...found };
  }

  // No single dish worked for everyone — find one each instead.
  const perProfile = [];
  for (const p of profiles) {
    let found = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const category = pool[Math.floor(Math.random() * pool.length)];
      const result = await tryRandomFromCategory(category, [p]);
      if (result) { found = result; break; }
    }
    perProfile.push({ profile: p, result: found });
  }
  return { type: 'per-profile', perProfile };
}

async function tryRandomFromCategory(category, profiles) {
  try {
    const listRes = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`).then(r => r.json());
    if (!listRes.meals || !listRes.meals.length) return null;
    const pick = listRes.meals[Math.floor(Math.random() * listRes.meals.length)];
    const meal = await fetchMealDetail(pick.idMeal);
    if (!meal) return null;
    const ingredientsList = extractIngredientsList(meal);
    const ingredientsText = ingredientsList.join(', ');
    const verdict = checkIngredientsForProfiles(ingredientsText, profiles);
    const allOk = Object.values(verdict).every(v => v.status !== 'avoid');
    return allOk ? { meal, ingredientsList, ingredientsText } : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function courseLabel(course) {
  return course === 'starter' ? 'Starter' : course === 'main' ? 'Main' : 'Dessert';
}

function renderCourseResult(course, outcome) {
  const container = document.getElementById('meal-planner-results');
  const wrap = document.createElement('div');
  wrap.className = 'card planner-course';

  if (outcome.type === 'shared') {
    const { meal, ingredientsList, ingredientsText } = outcome;
    wrap.innerHTML = `
      <div class="card-body">
        <div class="tag">${courseLabel(course)} · shared</div>
        <img src="${meal.strMealThumb}" alt="" class="discover-thumb-wide" loading="lazy" style="margin-top:8px; border-radius:10px;">
        <h3>${meal.strMeal}</h3>
        <div class="badges">${badgesForIngredients(ingredientsText)}</div>
        <div class="card-actions">
          <button class="secondary-btn card-action-btn planner-add-plan">Add to plan</button>
          <button class="secondary-btn card-action-btn planner-add-saved">Add to saved</button>
          <button class="secondary-btn card-action-btn planner-cook-btn">👨‍🍳 Cook mode</button>
        </div>
      </div>`;
    wrap.querySelector('.planner-add-plan').addEventListener('click', () => saveDiscoveredRecipe(meal, ingredientsList, 'plan'));
    wrap.querySelector('.planner-add-saved').addEventListener('click', () => saveDiscoveredRecipe(meal, ingredientsList, 'saved'));
    wrap.querySelector('.planner-cook-btn').addEventListener('click', () => openCookMode(splitIntoSteps(meal.strInstructions), meal.strMeal));
  } else {
    const rows = outcome.perProfile.map(({ profile, result }) => {
      if (!result) {
        return `<div class="who"><strong>${profile.name}</strong>Nothing found that works — try again or adjust their profile.</div>`;
      }
      return `<div class="who"><strong>${profile.name}: ${result.meal.strMeal}</strong>
        <div class="card-actions" style="margin-top:8px;">
          <button class="secondary-btn card-action-btn" data-action="plan">Add to plan</button>
          <button class="secondary-btn card-action-btn" data-action="saved">Add to saved</button>
        </div></div>`;
    }).join('');
    wrap.innerHTML = `<div class="card-body"><div class="tag">${courseLabel(course)} · different meals</div>${rows}</div>`;
    wrap.querySelectorAll('.who').forEach((row, i) => {
      const result = outcome.perProfile[i].result;
      if (!result) return;
      row.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => saveDiscoveredRecipe(result.meal, result.ingredientsList, btn.dataset.action));
      });
    });
  }

  container.appendChild(wrap);
}

// ---- Merge saved/discovered recipes into the main Recipes tab ----
function loadSavedRecipes() {
  if (!window.mealAppDb) return;
  window.mealAppDb.collection('household').doc('saved-recipes').onSnapshot(snap => {
    const saved = snap.exists ? snap.data() : {};
    const discovered = Object.entries(saved).map(([id, r]) => ({
      id: 'discovered-' + id, title: r.title, type: 'discovered', thumb: r.thumb, source: r.source || 'TheMealDB',
      ingredients: r.ingredients, instructionsText: r.instructions,
      servings: 4, prepMinutes: '?', cookMinutes: '?'
    }));
    if (typeof mergeDiscoveredRecipes === 'function') mergeDiscoveredRecipes(discovered);
  }, err => console.error('Could not load saved recipes', err));
}

if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadSavedRecipes(); });
}
