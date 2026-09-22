// Imports a recipe from a URL (BBC Good Food, or most other recipe sites)
// by reading the structured "recipe" data the page already publishes for
// Google's recipe search results — the same data every recipe site embeds
// on purpose so machines can read it. This runs server-side because a
// browser blocks a website from fetching another website's raw content
// directly (CORS); only a signed-in member of this app may call it.

const { onCall, HttpsError } = require('firebase-functions/v2/https');

function flattenText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(flattenText).filter(Boolean).join('\n');
  if (typeof val === 'object') {
    if (val.text) return flattenText(val.text);
    if (val.name) return flattenText(val.name);
  }
  return '';
}

function extractRecipeFromHtml(html) {
  const scriptMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scriptMatches) {
    let parsed;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch (e) {
      continue; // some sites ship slightly malformed JSON-LD — skip and keep looking
    }
    const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const item of candidates) {
      if (!item || !item['@type']) continue;
      const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
      if (types.includes('Recipe')) return item;
    }
  }
  return null;
}

exports.importRecipe = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }

  const url = (request.data && request.data.url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new HttpsError('invalid-argument', 'Enter a valid recipe web address.');
  }

  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OurMealPlanApp/1.0)' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    html = await res.text();
  } catch (err) {
    throw new HttpsError('unavailable', "Couldn't open that page — check the link and try again.");
  }

  const recipe = extractRecipeFromHtml(html);
  if (!recipe) {
    throw new HttpsError('not-found', "Couldn't find recipe details on that page. Try the actual recipe page (not a search or category page), or add it manually instead.");
  }

  const title = flattenText(recipe.name) || 'Imported recipe';
  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map(flattenText).filter(Boolean)
    : [];

  let steps = [];
  if (Array.isArray(recipe.recipeInstructions)) {
    steps = recipe.recipeInstructions
      .map(step => {
        if (typeof step === 'string') return step;
        if (step.itemListElement) return step.itemListElement.map(flattenText).filter(Boolean).join(' ');
        return flattenText(step.text) || flattenText(step.name);
      })
      .filter(Boolean);
  } else {
    steps = flattenText(recipe.recipeInstructions).split(/\n+/).filter(Boolean);
  }

  let image = '';
  if (typeof recipe.image === 'string') image = recipe.image;
  else if (Array.isArray(recipe.image)) {
    const first = recipe.image[0];
    image = typeof first === 'string' ? first : (first && first.url) || '';
  } else if (recipe.image && recipe.image.url) {
    image = recipe.image.url;
  }

  return {
    title,
    ingredients,
    instructions: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    image,
    sourceUrl: url
  };
});
