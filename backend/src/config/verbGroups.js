const THIRD_GROUP_IR_VERBS = new Set([
  "aller",
  "venir",
  "tenir",
  "partir",
  "sortir",
  "dormir",
  "servir",
  "sentir",
  "mentir",
  "ouvrir",
  "offrir",
  "souffrir",
  "cueillir",
  "accueillir",
  "recueillir",
  "couvrir",
  "découvrir",
  "courir",
  "mourir",
  "acquérir",
  "conquérir"
]);

const VALID_GROUPS = new Set(["group1", "group2", "group3"]);

function normalizeLemma(lemma) {
  const trimmed = String(lemma).trim().toLowerCase();
  if (trimmed.startsWith("se ")) {
    return trimmed.slice(3);
  }
  if (trimmed.startsWith("s'")) {
    return trimmed.slice(2);
  }
  return trimmed;
}

export function detectVerbGroup(lemma) {
  const base = normalizeLemma(lemma);

  if (base.endsWith("er") && base !== "aller") {
    return "group1";
  }

  if (base.endsWith("ir") && !THIRD_GROUP_IR_VERBS.has(base)) {
    return "group2";
  }

  return "group3";
}

export function categorizeVerbsByGroup(verbs) {
  const categories = {
    group1: [],
    group2: [],
    group3: []
  };

  for (const verb of verbs) {
    const group = detectVerbGroup(verb);
    categories[group].push(verb);
  }

  return categories;
}

export function normalizeSelectedVerbGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }

  const unique = [];
  for (const group of groups) {
    if (!VALID_GROUPS.has(group)) {
      continue;
    }
    if (!unique.includes(group)) {
      unique.push(group);
    }
  }

  return unique;
}
