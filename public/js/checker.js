let RULES = null;

window.rulesReady = fetch('data/ingredient-rules.json')
  .then(r => r.json())
  .then(data => { RULES = data; window.RULES = data; return data; })
  .catch(err => { console.error('Could not load ingredient-rules.json', err); throw err; });

// ---- Core matching logic, run once per profile ----
// A profile looks like: { id, name, diet: 'vegan'|'vegetarian'|'meat',
//   allergies: ['dairy','wheat',...], ibs: true/false, dislikes: [...], likes: [...] }
function checkForProfile(text, profile) {
  const lower = text.toLowerCase();
  const hits = { allergy: [], diet: [], ibs: [], dislike: [] };
  let likeHit = false;

  (profile.allergies || []).forEach(key => {
    const group = RULES.allergenGroups[key];
    if (!group) return;
    const matches = group.terms.filter(t => lower.includes(t.toLowerCase()));
    if (matches.length) hits.allergy.push({ group: group.label, matches });
  });

  if (profile.diet === 'vegan' || profile.diet === 'vegetarian') {
    ['meatTerms', 'fishTerms'].forEach(key => {
      const matches = RULES.dietGroups[key].filter(t => lower.includes(t.toLowerCase()));
      if (matches.length) hits.diet.push({ group: key === 'meatTerms' ? 'Meat' : 'Fish/seafood', matches });
    });
  }
  if (profile.diet === 'vegan') {
    ['dairyTerms', 'eggTerms', 'honeyTerms'].forEach(key => {
      const matches = RULES.dietGroups[key].filter(t => lower.includes(t.toLowerCase()));
      if (matches.length) hits.diet.push({ group: key === 'dairyTerms' ? 'Dairy' : key === 'eggTerms' ? 'Egg' : 'Honey', matches });
    });
  }

  if (profile.ibs) {
    const matches = RULES.fodmapTerms.filter(t => lower.includes(t.toLowerCase()));
    if (matches.length) hits.ibs = matches;
  }

  (profile.dislikes || []).forEach(word => {
    if (word && lower.includes(word.toLowerCase())) hits.dislike.push(word);
  });
  (profile.likes || []).forEach(word => {
    if (word && lower.includes(word.toLowerCase())) likeHit = true;
  });

  let status = 'ok';
  if (hits.allergy.length || hits.diet.length || hits.dislike.length) status = 'avoid';
  else if (hits.ibs.length) status = 'caution';

  return { name: profile.name, status, hits, likeHit };
}

// Checks a block of ingredient text against every given profile.
// Returns { [profileId]: { name, status, hits, likeHit } }
function checkIngredientsForProfiles(text, profiles) {
  const result = {};
  (profiles || []).forEach(p => {
    result[p.id] = checkForProfile(text, p);
  });
  return result;
}

function verdictIcon(status) {
  return status === 'ok' ? '✅' : status === 'caution' ? '⚠️' : '❌';
}
function verdictClass(status) {
  return status === 'ok' ? 'verdict-ok' : status === 'caution' ? 'verdict-warn' : 'verdict-bad';
}

function renderVerdict(result, productName) {
  const box = document.getElementById('verdict');
  box.style.display = 'block';

  const rows = Object.values(result).map(r => {
    let hitLines = '';
    r.hits.allergy.forEach(h => hitLines += `<div class="hit-list">Contains ${h.group}: ${h.matches.join(', ')}</div>`);
    r.hits.diet.forEach(h => hitLines += `<div class="hit-list">Contains ${h.group.toLowerCase()}: ${h.matches.join(', ')}</div>`);
    if (r.hits.ibs.length) hitLines += `<div class="hit-list">FODMAP trigger: ${r.hits.ibs.join(', ')} — check tolerance</div>`;
    if (r.hits.dislike.length) hitLines += `<div class="hit-list">Contains a dislike: ${r.hits.dislike.join(', ')}</div>`;
    if (r.likeHit) hitLines += `<div class="hit-list">⭐ Contains something they like</div>`;
    return `<div class="verdict-row ${verdictClass(r.status)}"><span class="verdict-icon">${verdictIcon(r.status)}</span><div><strong>${r.name}</strong>${hitLines}</div></div>`;
  }).join('');

  const allOk = Object.values(result).every(r => r.status !== 'avoid');
  const banner = allOk
    ? '<div class="verdict-row verdict-ok"><span class="verdict-icon">✅</span><strong>Nothing flagged for anyone</strong></div>'
    : '<div class="verdict-row verdict-bad"><span class="verdict-icon">❌</span><strong>Not right for at least one person</strong></div>';

  box.innerHTML = (productName ? `<h4>${productName}</h4>` : '') + banner + rows +
    '<div class="hit-list" style="margin-top:8px;">Simple text match only — always check the actual label if unsure.</div>';
}

// ---- Manual check ----
document.getElementById('check-manual').addEventListener('click', () => {
  const text = document.getElementById('manual-input').value.trim();
  if (!text || !RULES) return;
  const profiles = typeof getProfiles === 'function' ? getProfiles() : [];
  if (!profiles.length) {
    alert('Set up at least one profile first (the ⚙️ icon in the header).');
    return;
  }
  renderVerdict(checkIngredientsForProfiles(text, profiles), null);
});

// ---- Barcode scanning ----
let scanner = null;
const scanBtn = document.getElementById('scan-btn');
const readerDiv = document.getElementById('reader');
const statusDiv = document.getElementById('scan-status');

scanBtn.addEventListener('click', () => {
  if (scanner) { stopScanner(); return; }
  readerDiv.style.display = 'block';
  scanBtn.textContent = '✖ Stop scanning';
  statusDiv.textContent = 'Point the camera at a barcode...';

  scanner = new Html5Qrcode('reader');
  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    onScanSuccess,
    () => {}
  ).catch(err => {
    statusDiv.textContent = 'Camera access failed: ' + err;
    stopScanner();
  });
});

function stopScanner() {
  if (scanner) scanner.stop().then(() => scanner.clear()).catch(() => {});
  scanner = null;
  readerDiv.style.display = 'none';
  scanBtn.textContent = '📷 Scan a barcode';
}

function onScanSuccess(decodedText) {
  statusDiv.textContent = 'Found barcode ' + decodedText + ' — looking it up...';
  stopScanner();
  lookupBarcode(decodedText);
}

function lookupBarcode(barcode) {
  fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
    .then(r => r.json())
    .then(data => {
      if (data.status !== 1 || !data.product) {
        statusDiv.textContent = 'Product not found — paste its ingredients manually below instead.';
        return;
      }
      const ingredients = data.product.ingredients_text || data.product.ingredients_text_en || '';
      if (!ingredients) {
        statusDiv.textContent = 'Found the product but no ingredients listed — paste them manually below.';
        return;
      }
      statusDiv.textContent = '';
      document.getElementById('manual-input').value = ingredients;
      const profiles = typeof getProfiles === 'function' ? getProfiles() : [];
      renderVerdict(checkIngredientsForProfiles(ingredients, profiles), data.product.product_name || barcode);
    })
    .catch(err => {
      statusDiv.textContent = 'Lookup failed — check your connection and try again, or enter ingredients manually.';
      console.error(err);
    });
}
