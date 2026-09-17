let cookSteps = [];
let cookIndex = 0;
let cookTimerInterval = null;
let cookTimerRemaining = 0;

// Splits free-text instructions (e.g. from TheMealDB or a custom recipe)
// into individual steps. Prefers real line breaks; falls back to splitting
// on sentence boundaries for recipes stored as one long paragraph.
function splitIntoSteps(text) {
  if (!text) return [];
  let lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  lines = lines.map(s => s.replace(/^\d+[\.\)]\s*/, ''));
  if (lines.length > 1) return lines;
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
}

// Looks for a duration in a step's text (e.g. "simmer for 15 minutes",
// "bake 20-25 min") and returns seconds, or null if none found.
function parseTimerSeconds(text) {
  const match = text.match(/(\d+)\s*(?:-|to)?\s*(\d+)?\s*(hour|hr|minute|min)s?/i);
  if (!match) return null;
  const low = parseInt(match[1], 10);
  const high = match[2] ? parseInt(match[2], 10) : low;
  const avg = Math.round((low + high) / 2);
  if (avg <= 0) return null;
  const unit = match[3].toLowerCase();
  return unit.startsWith('h') ? avg * 3600 : avg * 60;
}

// Finds a built-in or discovered/custom recipe by id and opens Cook Mode
// for it. `variant` ('his'/'hers') is only used for swap-type recipes.
function startCookModeForRecipe(id, variant) {
  const all = [...(typeof RECIPES !== 'undefined' ? RECIPES : []), ...(typeof DISCOVERED !== 'undefined' ? DISCOVERED : [])];
  const r = all.find(x => (x.id || x.title) === id);
  if (!r) { alert('Could not find that recipe.'); return; }

  let steps = [];
  let title = r.title;
  if (r.type === 'swap' && variant) {
    steps = [...(r.instructions || []), ...(r.variants[variant].instructions || [])];
    title += variant === 'his' ? ' — His' : ' — Her';
  } else if (r.type === 'discovered') {
    steps = splitIntoSteps(r.instructionsText);
  } else {
    steps = r.instructions || [];
  }
  if (!steps.length) { alert('No steps found for this recipe.'); return; }
  openCookMode(steps, title);
}

function openCookMode(steps, title) {
  cookSteps = steps;
  cookIndex = 0;
  document.getElementById('cookmode-title').textContent = title;
  document.getElementById('cookmode-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderCookStep();
}

function closeCookMode() {
  stopCookTimer();
  document.getElementById('cookmode-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function renderCookStep() {
  stopCookTimer();
  const step = cookSteps[cookIndex];
  document.getElementById('cookmode-step-text').textContent = step;
  document.getElementById('cookmode-progress').textContent = `Step ${cookIndex + 1} of ${cookSteps.length}`;
  document.getElementById('cookmode-prev-btn').disabled = cookIndex === 0;
  document.getElementById('cookmode-next-btn').textContent = cookIndex === cookSteps.length - 1 ? 'Done ✓' : 'Next ›';

  const seconds = parseTimerSeconds(step);
  const timerBtn = document.getElementById('cookmode-timer-btn');
  const timerDisplay = document.getElementById('cookmode-timer');
  timerDisplay.style.display = 'none';
  if (seconds) {
    timerBtn.style.display = '';
    timerBtn.textContent = `⏱ Start ${Math.round(seconds / 60) || 1} min timer`;
    timerBtn.dataset.seconds = seconds;
  } else {
    timerBtn.style.display = 'none';
  }
}

function startCookTimer(seconds) {
  stopCookTimer();
  cookTimerRemaining = seconds;
  const display = document.getElementById('cookmode-timer');
  document.getElementById('cookmode-timer-btn').style.display = 'none';
  display.style.display = '';
  updateTimerDisplay();
  cookTimerInterval = setInterval(() => {
    cookTimerRemaining--;
    updateTimerDisplay();
    if (cookTimerRemaining <= 0) {
      stopCookTimer();
      playBeep();
      display.textContent = "⏰ Time's up!";
    }
  }, 1000);
}

function stopCookTimer() {
  if (cookTimerInterval) clearInterval(cookTimerInterval);
  cookTimerInterval = null;
}

function updateTimerDisplay() {
  const m = Math.floor(cookTimerRemaining / 60);
  const s = cookTimerRemaining % 60;
  document.getElementById('cookmode-timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 600);
  } catch (e) { console.error('Beep failed', e); }
}

document.getElementById('cookmode-close-btn').addEventListener('click', closeCookMode);
document.getElementById('cookmode-prev-btn').addEventListener('click', () => {
  if (cookIndex > 0) { cookIndex--; renderCookStep(); }
});
document.getElementById('cookmode-next-btn').addEventListener('click', () => {
  if (cookIndex < cookSteps.length - 1) { cookIndex++; renderCookStep(); }
  else closeCookMode();
});
document.getElementById('cookmode-timer-btn').addEventListener('click', function () {
  const seconds = parseInt(this.dataset.seconds, 10);
  if (seconds) startCookTimer(seconds);
});
