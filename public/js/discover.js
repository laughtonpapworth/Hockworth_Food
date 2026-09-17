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

// ---- Dinner party planner (named, multi-course, guest-scaled events) ----
// ---- Dinner party wizard (named, multi-course, guest-scaled events) ----
const COURSE_META = {
  starter:    { label: 'Starter',       emoji: '🥗', type: 'recipe', categories: ['Starter'] },
  main:       { label: 'Main',          emoji: '🍽️', type: 'recipe', categories: ['Chicken', 'Beef', 'Pork', 'Seafood', 'Pasta', 'Vegetarian', 'Vegan', 'Lamb', 'Miscellaneous', 'Goat'] },
  dessert:    { label: 'Dessert',       emoji: '🍰', type: 'recipe', categories: ['Dessert'] },
  cheese:     { label: 'Cheese course', emoji: '🧀', type: 'note', placeholder: 'e.g. Brie, cheddar, oatcakes, grapes, chutney' },
  coffeeCake: { label: 'Coffee & cake', emoji: '☕', type: 'note', placeholder: 'e.g. Coffee, chocolate cake' }
};

let wizardDraft = null;
let wizardSteps = [];   // ordered array of step keys: 'setup', then a key per chosen course, then 'review'
let wizardStepIndex = 0;
let allCategoryNames = null; // cached, used to widen a course search that's come up short

document.getElementById('wizard-close-btn').addEventListener('click', closePartyWizard);
document.getElementById('wizard-back-btn').addEventListener('click', () => goToStep(wizardStepIndex - 1));
document.getElementById('wizard-next-btn').addEventListener('click', handleWizardNext);
document.getElementById('open-party-wizard-btn').addEventListener('click', () => {
  if (typeof openPartyWizard === 'function') openPartyWizard();
});

function openPartyWizard() {
  wizardDraft = { name: '', guests: 4, courses: {} };
  wizardSteps = ['setup'];
  wizardStepIndex = 0;
  document.getElementById('party-wizard-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderSetupStep();
}

function closePartyWizard() {
  document.getElementById('party-wizard-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function goToStep(index) {
  if (index < 0) return;
  wizardStepIndex = index;
  const key = wizardSteps[wizardStepIndex];
  if (key === 'setup') renderSetupStep();
  else if (key === 'review') renderReviewStep();
  else renderCourseStep(key);
}

function setWizardChrome(title, progressText, nextLabel, backVisible) {
  document.getElementById('wizard-title').textContent = title;
  document.getElementById('wizard-progress').textContent = progressText || '';
  document.getElementById('wizard-next-btn').textContent = nextLabel;
  document.getElementById('wizard-back-btn').style.visibility = backVisible ? 'visible' : 'hidden';
}

// ---- Step: setup (name, guests, courses) ----
function renderSetupStep() {
  setWizardChrome('New dinner party', '', 'Next ›', false);
  document.getElementById('wizard-body').innerHTML = `
    <label class="muted" style="display:block; margin-bottom:4px;">Event name</label>
    <input type="text" id="wizard-name-input" placeholder="e.g. Sarah's Birthday Dinner" style="width:100%; margin-bottom:14px;" value="${wizardDraft.name}">
    <label class="muted" style="display:block; margin-bottom:4px;">Guests <span class="muted-inline">— recipes assume 4 servings by default</span></label>
    <input type="number" id="wizard-guests-input" min="1" value="${wizardDraft.guests}" style="width:100%; margin-bottom:14px;">
    <label class="muted" style="display:block; margin-bottom:6px;">Courses</label>
    <div class="filter-row">
      <button type="button" class="filter-btn wiz-course-toggle active" data-course="starter">Starter</button>
      <button type="button" class="filter-btn wiz-course-toggle active" data-course="main">Main</button>
      <button type="button" class="filter-btn wiz-course-toggle active" data-course="dessert">Dessert</button>
      <button type="button" class="filter-btn wiz-course-toggle" data-course="cheese">Cheese</button>
      <button type="button" class="filter-btn wiz-course-toggle" data-course="coffeeCake">Coffee &amp; cake</button>
    </div>`;
  document.querySelectorAll('.wiz-course-toggle').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });
}

async function handleSetupNext() {
  const name = document.getElementById('wizard-name-input').value.trim();
  const guests = parseInt(document.getElementById('wizard-guests-input').value, 10);
  if (!name) { alert('Give this event a name first.'); return; }
  if (!guests || guests < 1) { alert('Enter how many guests are coming.'); return; }
  const chosenCourses = Array.from(document.querySelectorAll('.wiz-course-toggle.active')).map(b => b.dataset.course);
  if (!chosenCourses.length) { alert('Pick at least one course.'); return; }

  const profiles = getSelectedDiscoverProfiles();
  if (!profiles.length) { alert('Select at least one person on the main Discover screen first.'); closePartyWizard(); return; }

  wizardDraft.name = name;
  wizardDraft.guests = guests;
  chosenCourses.forEach(key => {
    wizardDraft.courses[key] = COURSE_META[key].type === 'note'
      ? { type: 'note', text: '' }
      : { type: 'recipe', chosen: null, seenIds: new Set() };
  });

  try { await window.rulesReady; } catch {}
  wizardSteps = ['setup', ...chosenCourses, 'review'];
  goToStep(1);
}

// ---- Step: a single course ----
// ---- Step: a single course ----
const MEAT_FISH_CATEGORIES = ['Chicken', 'Beef', 'Pork', 'Seafood', 'Lamb', 'Goat'];
const GARNISH_KEYWORDS = ['pickle', 'chutney', 'relish', 'marmalade', 'garnish', 'dressing', 'dip', 'jam'];

function looksLikeGarnish(title) {
  const lower = (title || '').toLowerCase();
  return GARNISH_KEYWORDS.some(k => lower.includes(k));
}

// Excludes meat/fish categories from the Main course pool outright whenever
// any currently-selected profile is vegan or vegetarian — a second, source-
// level layer of protection alongside the ingredient-text check, so a meat
// dish can never even be drawn as a candidate for that person.
function courseCategoryPool(meta, profiles) {
  if (meta.categories.length === 1) return meta.categories; // Starter/Dessert are fixed, single-category
  const anyVeg = profiles.some(p => p.diet === 'vegan' || p.diet === 'vegetarian');
  if (!anyVeg) return meta.categories;
  const filtered = meta.categories.filter(c => !MEAT_FISH_CATEGORIES.includes(c));
  return filtered.length ? filtered : meta.categories;
}

async function renderCourseStep(key) {
  const meta = COURSE_META[key];
  const stepNum = wizardSteps.indexOf(key);
  setWizardChrome(`${meta.emoji} ${meta.label}`, `Course ${stepNum} of ${wizardSteps.length - 2}`, 'Next course ›', true);

  if (meta.type === 'note') {
    document.getElementById('wizard-body').innerHTML = `
      <p class="muted" style="margin-bottom:10px;">Not a searched recipe — just jot what you're serving.</p>
      <textarea id="wizard-note-input" rows="4" placeholder="${meta.placeholder}">${wizardDraft.courses[key].text}</textarea>`;
    document.getElementById('wizard-note-input').addEventListener('input', e => {
      wizardDraft.courses[key].text = e.target.value;
    });
    return;
  }

  if (wizardDraft.courses[key].chosen) {
    renderCourseChosenConfirmation(key, meta);
    return;
  }

  document.getElementById('wizard-body').innerHTML = `
    <div id="wizard-course-status" class="status-line">Finding options...</div>
    <div id="wizard-course-grid" class="planner-options-grid"></div>
    <button type="button" id="wizard-refresh-btn" class="secondary-btn" style="width:100%; margin-top:12px;">🔄 New ideas</button>
    <div class="wizard-alt-actions">
      <button type="button" id="wizard-type-own-btn" class="secondary-btn">✍️ Type my own instead</button>
      <button type="button" id="wizard-scan-own-btn" class="secondary-btn">📷 Scan a photo instead</button>
    </div>`;
  document.getElementById('wizard-refresh-btn').addEventListener('click', () => loadCourseOptions(key, meta));
  document.getElementById('wizard-type-own-btn').addEventListener('click', () => renderWizardManualForm(key, meta));
  document.getElementById('wizard-scan-own-btn').addEventListener('click', () => renderWizardScanForm(key, meta));
  await loadCourseOptions(key, meta);
}

function renderCourseChosenConfirmation(key, meta) {
  const chosen = wizardDraft.courses[key].chosen;
  document.getElementById('wizard-body').innerHTML = `
    <div class="note">✓ Using: <strong>${chosen.meal.strMeal}</strong></div>
    <button type="button" class="secondary-btn" id="wizard-change-btn">Change this choice</button>`;
  document.getElementById('wizard-change-btn').addEventListener('click', () => {
    wizardDraft.courses[key].chosen = null;
    renderCourseStep(key);
  });
}

// ---- Type your own dish for this course ----
function renderWizardManualForm(key, meta, prefill) {
  const body = document.getElementById('wizard-body');
  const t = prefill || { title: '', ingredients: [], instructions: [] };
  body.innerHTML = `
    <button type="button" class="secondary-btn" id="wizard-back-to-search">‹ Back to search results</button>
    ${prefill ? '<div class="note" style="margin-top:10px;">Pulled from the photo — OCR isn\'t perfect, check it over.</div>' : ''}
    <label class="muted" style="display:block;margin:12px 0 4px;">${meta.label} title</label>
    <input type="text" id="wiz-own-title" value="${(t.title || '').replace(/"/g, '&quot;')}">
    <label class="muted" style="display:block;margin:12px 0 4px;">Ingredients <span class="muted-inline">— one per line</span></label>
    <textarea id="wiz-own-ingredients" rows="4">${(t.ingredients || []).join('\n')}</textarea>
    <label class="muted" style="display:block;margin:12px 0 4px;">Method <span class="muted-inline">— one step per line</span></label>
    <textarea id="wiz-own-instructions" rows="4">${(t.instructions || []).join('\n')}</textarea>
    <button type="button" class="primary-btn" id="wiz-own-save" style="margin-top:14px;">Use this</button>`;
  document.getElementById('wizard-back-to-search').addEventListener('click', () => renderCourseStep(key));
  document.getElementById('wiz-own-save').addEventListener('click', () => {
    const title = document.getElementById('wiz-own-title').value.trim();
    const ingredients = document.getElementById('wiz-own-ingredients').value.split('\n').map(s => s.trim()).filter(Boolean);
    const instructions = document.getElementById('wiz-own-instructions').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!title || !ingredients.length) { alert('Add at least a title and one ingredient.'); return; }
    wizardDraft.courses[key].chosen = {
      meal: { strMeal: title, strMealThumb: null, strInstructions: instructions.join('\n') },
      ingredientsList: ingredients,
      ingredientsText: ingredients.join(', ')
    };
    renderCourseChosenConfirmation(key, meta);
  });
}

// ---- Scan a photo for this course (reuses loadTesseractScript/parseRecipeText from app.js) ----
function renderWizardScanForm(key, meta) {
  const body = document.getElementById('wizard-body');
  body.innerHTML = `
    <button type="button" class="secondary-btn" id="wizard-back-to-search">‹ Back to search results</button>
    <p class="muted" style="margin:12px 0;">Take or choose a photo of the dish's recipe for this course.</p>
    <input type="file" accept="image/*" capture="environment" id="wiz-scan-input">
    <div id="wiz-scan-status" class="status-line"></div>`;
  document.getElementById('wizard-back-to-search').addEventListener('click', () => renderCourseStep(key));
  document.getElementById('wiz-scan-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('wiz-scan-status');
    try {
      statusEl.textContent = 'Loading the text reader (first time only)...';
      if (!window.Tesseract) await loadTesseractScript();
      statusEl.textContent = 'Reading the photo — this can take a moment...';
      const worker = await Tesseract.createWorker('eng');
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      statusEl.textContent = '';
      renderWizardManualForm(key, meta, parseRecipeText(text));
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Could not read that photo — try a clearer image, or type it in instead.';
    }
  });
}

async function loadCourseOptions(key, meta) {
  const profiles = getSelectedDiscoverProfiles();
  const statusEl = document.getElementById('wizard-course-status');
  const grid = document.getElementById('wizard-course-grid');
  statusEl.textContent = 'Finding options...';
  grid.innerHTML = '';

  const seenIds = wizardDraft.courses[key].seenIds;
  const pool = courseCategoryPool(meta, profiles);
  const options = await findCourseOptions(pool, profiles, seenIds, 3);
  options.forEach(o => seenIds.add(o.meal.idMeal));

  if (!options.length) {
    statusEl.textContent = "Nothing found that works for everyone in this category — try New ideas again, or add your own dish below.";
    return;
  }
  statusEl.textContent = options.length < 3
    ? `Only found ${options.length} option${options.length === 1 ? '' : 's'} that work for everyone — try New ideas, or add your own below.`
    : 'Found 3 — pick one, or add your own below:';
  renderOptionCards(grid, options, key, profiles);
}

async function findCourseOptions(categoryPool, profiles, seenIds, count) {
  const found = [];
  const localSeen = new Set(seenIds);
  for (let attempt = 0; attempt < 25 && found.length < count; attempt++) {
    const category = categoryPool[Math.floor(Math.random() * categoryPool.length)];
    const listRes = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`).then(r => r.json()).catch(() => null);
    if (!listRes || !listRes.meals || !listRes.meals.length) continue;
    const pick = listRes.meals[Math.floor(Math.random() * listRes.meals.length)];
    if (localSeen.has(pick.idMeal)) continue;
    localSeen.add(pick.idMeal);
    if (looksLikeGarnish(pick.strMeal)) continue;
    const meal = await fetchMealDetail(pick.idMeal);
    if (!meal) continue;
    const ingredientsList = extractIngredientsList(meal);
    const ingredientsText = ingredientsList.join(', ');
    const verdict = checkIngredientsForProfiles(ingredientsText, profiles);
    const allOk = Object.values(verdict).every(v => v.status !== 'avoid');
    if (allOk) found.push({ meal, ingredientsList, ingredientsText });
  }
  return found;
}

function compactBadges(ingredientsText, profiles) {
  if (!(typeof checkIngredientsForProfiles === 'function' && window.RULES && profiles.length)) return '';
  const verdict = checkIngredientsForProfiles(ingredientsText, profiles);
  return Object.values(verdict).map(r => r.status === 'ok' ? '✅' : r.status === 'caution' ? '⚠️' : '❌').join(' ');
}

function renderOptionCards(grid, options, courseKey, profiles) {
  options.forEach(opt => {
    const card = document.createElement('div');
    card.className = 'planner-option-card';
    card.innerHTML = `
      <img src="${opt.meal.strMealThumb}" class="planner-option-thumb" loading="lazy" alt="">
      <div class="planner-option-title">${opt.meal.strMeal}</div>
      <div class="planner-option-badge">${compactBadges(opt.ingredientsText, profiles)}</div>
      <button type="button" class="secondary-btn planner-choose-btn">Choose</button>`;
    card.querySelector('.planner-choose-btn').addEventListener('click', () => {
      wizardDraft.courses[courseKey].chosen = opt;
      renderCourseChosenConfirmation(courseKey, COURSE_META[courseKey]);
    });
    grid.appendChild(card);
  });
}

// ---- Step: review + save ----

// ---- Step: review + save ----
function renderReviewStep() {
  setWizardChrome('Review', `${wizardSteps.length - 2} course${wizardSteps.length - 2 === 1 ? '' : 's'}`, 'Save event ✓', true);
  const lines = Object.entries(wizardDraft.courses).map(([key, c]) => {
    const meta = COURSE_META[key];
    const summary = c.type === 'note' ? (c.text || '(nothing noted)') : (c.chosen ? c.chosen.meal.strMeal : '(not chosen yet)');
    return `<div class="event-course-line">${meta.emoji} ${meta.label}: <strong>${summary}</strong></div>`;
  }).join('');
  document.getElementById('wizard-body').innerHTML = `
    <p style="font-weight:800; font-size:1.1rem; margin-bottom:4px;">${wizardDraft.name}</p>
    <p class="muted" style="margin-bottom:14px;">${wizardDraft.guests} guests</p>
    ${lines}`;
}

async function handleWizardNext() {
  const key = wizardSteps[wizardStepIndex];
  if (key === 'setup') { await handleSetupNext(); return; }
  if (key === 'review') { saveWizardEvent(); return; }

  const course = wizardDraft.courses[key];
  if (course.type === 'recipe' && !course.chosen) {
    alert(`Choose a dish for ${COURSE_META[key].label} first.`);
    return;
  }
  goToStep(wizardStepIndex + 1);
}

function saveWizardEvent() {
  const missing = Object.entries(wizardDraft.courses).filter(([k, c]) => c.type === 'recipe' && !c.chosen);
  if (missing.length) {
    alert(`Choose a dish for: ${missing.map(([k]) => COURSE_META[k].label).join(', ')}`);
    return;
  }
  const coursesToSave = {};
  Object.entries(wizardDraft.courses).forEach(([key, c]) => {
    coursesToSave[key] = c.type === 'note'
      ? { type: 'note', label: COURSE_META[key].label, text: c.text || '' }
      : {
          type: 'recipe', label: COURSE_META[key].label,
          title: c.chosen.meal.strMeal, thumb: c.chosen.meal.strMealThumb,
          ingredients: c.chosen.ingredientsList, instructions: c.chosen.meal.strInstructions || ''
        };
  });
  if (typeof saveEvent === 'function') saveEvent(wizardDraft.name, wizardDraft.guests, coursesToSave);
  closePartyWizard();
  alert('Event saved — find its shopping list under Shopping → 🎉 Events.');
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
