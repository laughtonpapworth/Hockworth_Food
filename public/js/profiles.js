let PROFILES = [];

function getProfiles() { return PROFILES; }

const profilesDocRef = () =>
  window.mealAppDb ? window.mealAppDb.collection('household').doc('profiles') : null;

function saveProfiles() {
  const ref = profilesDocRef();
  if (!ref) { alert('Sign in first to save profiles.'); return; }
  ref.set({ list: PROFILES }).catch(err => {
    console.error('Could not save profiles', err);
    alert('Could not save — check your connection and try again.');
  });
}

function loadProfiles() {
  const ref = profilesDocRef();
  if (!ref) return;
  ref.onSnapshot(snap => {
    if (snap.exists && Array.isArray(snap.data().list) && snap.data().list.length) {
      PROFILES = snap.data().list;
    } else if (!snap.exists) {
      // First-ever load: seed with two starter profiles matching what this
      // household was already using, so nothing is lost by switching over
      // to the new profile system.
      PROFILES = [
        { id: 'p_' + Date.now() + '_a', name: 'Laughton', diet: 'meat', allergies: ['wheat'], ibs: true, customAllergies: ['beef'], dislikes: [], likes: [] },
        { id: 'p_' + Date.now() + '_b', name: 'Laura', diet: 'vegetarian', allergies: ['dairy', 'soy'], ibs: false, customAllergies: [], dislikes: ['mushroom', 'courgette', 'aubergine', 'tofu'], likes: [] }
      ];
      saveProfiles();
    }
    renderProfiles();
    if (typeof refreshAll === 'function') refreshAll();
    if (typeof renderDiscoverProfileSelector === 'function') renderDiscoverProfileSelector();
  }, err => console.error('Could not load profiles', err));
}

if (window.mealAppAuth) {
  window.mealAppAuth.onAuthStateChanged(user => { if (user) loadProfiles(); });
}

// ---- Settings panel open/close ----
document.getElementById('settings-btn').addEventListener('click', () => {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('profiles').classList.add('active');
  renderProfiles();
});
document.getElementById('profiles-back-btn').addEventListener('click', () => {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('recipes').classList.add('active');
  document.querySelector('.nav-btn[data-tab="recipes"]').classList.add('active');
});

document.getElementById('add-profile-btn').addEventListener('click', () => {
  PROFILES.push({ id: 'p_' + Date.now(), name: 'New person', diet: 'meat', allergies: [], ibs: false, customAllergies: [], dislikes: [], likes: [] });
  saveProfiles();
  renderProfiles();
});

const ALLERGY_KEYS = ['dairy', 'soy', 'wheat', 'nuts', 'peanuts', 'egg', 'shellfish', 'fish', 'sesame'];
const ALLERGY_LABELS = {
  dairy: 'Dairy', soy: 'Soy', wheat: 'Wheat / Gluten', nuts: 'Tree nuts', peanuts: 'Peanuts',
  egg: 'Egg', shellfish: 'Shellfish', fish: 'Fish', sesame: 'Sesame'
};

function renderProfiles() {
  const container = document.getElementById('profiles-list');
  if (!container) return;

  container.innerHTML = PROFILES.map((p, idx) => `
    <div class="profile-card" data-idx="${idx}">
      <div class="profile-row">
        <input type="text" class="profile-name-input" data-idx="${idx}" value="${(p.name || '').replace(/"/g, '&quot;')}" placeholder="Name">
        <button type="button" class="profile-delete-btn" data-idx="${idx}" title="Delete profile">🗑️</button>
      </div>

      <div class="profile-section-label">Diet type</div>
      <div class="diet-toggle">
        ${['vegan', 'vegetarian', 'meat'].map(d => `
          <button type="button" class="diet-btn ${p.diet === d ? 'active' : ''}" data-idx="${idx}" data-diet="${d}">
            ${d === 'meat' ? 'Meat-eater' : d.charAt(0).toUpperCase() + d.slice(1)}
          </button>`).join('')}
      </div>

      <div class="profile-section-label">Allergies &amp; intolerances</div>
      <div class="allergy-grid">
        ${ALLERGY_KEYS.map(key => `
          <label class="allergy-check">
            <input type="checkbox" data-idx="${idx}" data-allergy="${key}" ${(p.allergies || []).includes(key) ? 'checked' : ''}>
            ${ALLERGY_LABELS[key]}
          </label>`).join('')}
        ${(p.customAllergies || []).map(term => `
          <label class="allergy-check">
            <input type="checkbox" data-idx="${idx}" data-custom-allergy="${term.replace(/"/g, '&quot;')}" checked>
            ${term}
          </label>`).join('')}
        <label class="allergy-check allergy-ibs">
          <input type="checkbox" data-idx="${idx}" data-ibs="1" ${p.ibs ? 'checked' : ''}>
          IBS (FODMAP caution)
        </label>
      </div>
      <div class="add-custom-allergy-row" data-idx="${idx}">
        <input type="text" class="add-custom-allergy-input" placeholder="Add another allergy/intolerance...">
        <button type="button" class="secondary-btn add-custom-allergy-btn">Add</button>
      </div>

      <div class="profile-section-label">Dislikes <span class="muted-inline">— excluded from results</span></div>
      <div class="tag-input" data-idx="${idx}" data-kind="dislikes">
        <div class="tag-chips">${(p.dislikes || []).map(w => tagChipHtml(w)).join('')}</div>
        <input type="text" class="tag-add-input" placeholder="Type and press Enter">
      </div>

      <div class="profile-section-label">Likes <span class="muted-inline">— highlighted in results</span></div>
      <div class="tag-input" data-idx="${idx}" data-kind="likes">
        <div class="tag-chips">${(p.likes || []).map(w => tagChipHtml(w)).join('')}</div>
        <input type="text" class="tag-add-input" placeholder="Type and press Enter">
      </div>
    </div>
  `).join('') || '<div class="note">No profiles yet — add one to get started.</div>';

  wireProfileEvents(container);
}

function tagChipHtml(word) {
  return `<span class="tag-chip">${word}<button type="button" class="tag-chip-remove">✕</button></span>`;
}

function wireProfileEvents(container) {
  container.querySelectorAll('.profile-name-input').forEach(input => {
    input.addEventListener('change', () => {
      PROFILES[input.dataset.idx].name = input.value.trim() || 'Unnamed';
      saveProfiles();
    });
  });

  container.querySelectorAll('.profile-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      if (confirm(`Delete ${PROFILES[idx].name}'s profile?`)) {
        PROFILES.splice(idx, 1);
        saveProfiles();
        renderProfiles();
      }
    });
  });

  container.querySelectorAll('.diet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      PROFILES[btn.dataset.idx].diet = btn.dataset.diet;
      saveProfiles();
      renderProfiles();
    });
  });

  container.querySelectorAll('input[type="checkbox"][data-allergy]').forEach(box => {
    box.addEventListener('change', () => {
      const p = PROFILES[box.dataset.idx];
      p.allergies = p.allergies || [];
      const key = box.dataset.allergy;
      if (box.checked && !p.allergies.includes(key)) p.allergies.push(key);
      if (!box.checked) p.allergies = p.allergies.filter(a => a !== key);
      saveProfiles();
    });
  });

  container.querySelectorAll('input[type="checkbox"][data-ibs]').forEach(box => {
    box.addEventListener('change', () => {
      PROFILES[box.dataset.idx].ibs = box.checked;
      saveProfiles();
    });
  });

  container.querySelectorAll('input[type="checkbox"][data-custom-allergy]').forEach(box => {
    box.addEventListener('change', () => {
      if (box.checked) return; // custom entries start checked; only unticking does anything
      const p = PROFILES[box.dataset.idx];
      p.customAllergies = (p.customAllergies || []).filter(t => t !== box.dataset.customAllergy);
      saveProfiles();
      renderProfiles();
    });
  });

  container.querySelectorAll('.add-custom-allergy-row').forEach(row => {
    const idx = row.dataset.idx;
    const input = row.querySelector('.add-custom-allergy-input');
    const btn = row.querySelector('.add-custom-allergy-btn');
    function addCustomAllergy() {
      const val = input.value.trim().toLowerCase();
      if (!val) return;
      const p = PROFILES[idx];
      p.customAllergies = p.customAllergies || [];
      if (!p.customAllergies.includes(val)) p.customAllergies.push(val);
      input.value = '';
      saveProfiles();
      renderProfiles();
    }
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAllergy(); } });
    btn.addEventListener('click', addCustomAllergy);
  });

  container.querySelectorAll('.tag-input').forEach(wrap => {
    const idx = wrap.dataset.idx;
    const kind = wrap.dataset.kind;
    const input = wrap.querySelector('.tag-add-input');
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const val = input.value.trim().toLowerCase();
      if (!val) return;
      PROFILES[idx][kind] = PROFILES[idx][kind] || [];
      if (!PROFILES[idx][kind].includes(val)) PROFILES[idx][kind].push(val);
      input.value = '';
      saveProfiles();
      renderProfiles();
    });
    wrap.querySelectorAll('.tag-chip-remove').forEach((removeBtn, i) => {
      removeBtn.addEventListener('click', () => {
        PROFILES[idx][kind].splice(i, 1);
        saveProfiles();
        renderProfiles();
      });
    });
  });
}
