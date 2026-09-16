let RULES = null;

window.rulesReady = fetch('data/ingredient-rules.json')
  .then(r => r.json())
  .then(data => { RULES = data; window.RULES = data; return data; })
  .catch(err => { console.error('Could not load ingredient-rules.json', err); throw err; });

// ---- Core matching logic ----
function checkIngredients(text) {
  const lower = text.toLowerCase();
  const result = {};

  Object.entries(RULES.profiles).forEach(([key, profile]) => {
    const allergenHits = profile.allergens.terms.filter(term => lower.includes(term.toLowerCase()));
    const cautionHits = (profile.caution.terms || []).filter(term => lower.includes(term.toLowerCase()));

    let status = 'ok';
    if (allergenHits.length > 0) status = 'bad';
    else if (cautionHits.length > 0) status = 'warn';

    result[key] = { label: profile.label, status, allergenHits, cautionHits };
  });

  return result;
}

function renderVerdict(result, productName) {
  const box = document.getElementById('verdict');
  box.style.display = 'block';

  const rows = Object.values(result).map(r => {
    const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
    const cls = r.status === 'ok' ? 'verdict-ok' : r.status === 'warn' ? 'verdict-warn' : 'verdict-bad';
    let hits = '';
    if (r.allergenHits.length) hits += `<div class="hit-list">Contains: ${r.allergenHits.join(', ')}</div>`;
    if (r.cautionHits.length) hits += `<div class="hit-list">FODMAP trigger: ${r.cautionHits.join(', ')} — check your tolerance</div>`;
    return `<div class="verdict-row ${cls}"><span class="verdict-icon">${icon}</span><div><strong>${r.label}</strong>${hits}</div></div>`;
  }).join('');

  const bothOk = Object.values(result).every(r => r.status !== 'bad');
  const banner = bothOk
    ? '<div class="verdict-row verdict-ok"><span class="verdict-icon">✅</span><strong>No confirmed allergens for either of you</strong></div>'
    : '<div class="verdict-row verdict-bad"><span class="verdict-icon">❌</span><strong>Not safe for at least one of you</strong></div>';

  box.innerHTML = (productName ? `<h4>${productName}</h4>` : '') + banner + rows +
    '<div class="hit-list" style="margin-top:8px;">Simple text match only — always check the actual label if unsure, and watch for "may contain" warnings separately.</div>';
}

// ---- Manual check ----
document.getElementById('check-manual').addEventListener('click', () => {
  const text = document.getElementById('manual-input').value.trim();
  if (!text || !RULES) return;
  renderVerdict(checkIngredients(text), null);
});

// ---- Barcode scanning ----
let scanner = null;
const scanBtn = document.getElementById('scan-btn');
const readerDiv = document.getElementById('reader');
const statusDiv = document.getElementById('scan-status');

scanBtn.addEventListener('click', () => {
  if (scanner) {
    stopScanner();
    return;
  }
  readerDiv.style.display = 'block';
  scanBtn.textContent = '✖ Stop scanning';
  statusDiv.textContent = 'Point the camera at a barcode...';

  scanner = new Html5Qrcode('reader');
  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    onScanSuccess,
    () => {} // ignore per-frame scan failures
  ).catch(err => {
    statusDiv.textContent = 'Camera access failed: ' + err;
    stopScanner();
  });
});

function stopScanner() {
  if (scanner) {
    scanner.stop().then(() => scanner.clear()).catch(() => {});
  }
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
      renderVerdict(checkIngredients(ingredients), data.product.product_name || barcode);
    })
    .catch(err => {
      statusDiv.textContent = 'Lookup failed — check your connection and try again, or enter ingredients manually.';
      console.error(err);
    });
}
