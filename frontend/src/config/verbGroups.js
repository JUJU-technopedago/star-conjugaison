const THIRD_GROUP_IR_VERBS = new Set([
  'aller',
  'venir',
  'tenir',
  'partir',
  'sortir',
  'dormir',
  'servir',
  'sentir',
  'mentir',
  'ouvrir',
  'offrir',
  'souffrir',
  'cueillir',
  'accueillir',
  'recueillir',
  'couvrir',
  'decouvrir',
  'courir',
  'mourir',
  'acquerir',
  'conquerir'
]);

const VALID_GROUPS = new Set(['group1', 'group2', 'group3']);

function normalizeLemma(lemma) {
  const trimmed = String(lemma).trim().toLowerCase();
  if (trimmed.startsWith('se ')) {
    return trimmed.slice(3);
  }
  if (trimmed.startsWith("s'")) {
    return trimmed.slice(2);
  }

  // Lightweight accent fold to keep group detection stable.
  return trimmed
    .replaceAll('é', 'e')
    .replaceAll('è', 'e')
    .replaceAll('ê', 'e')
    .replaceAll('ë', 'e')
    .replaceAll('à', 'a')
    .replaceAll('â', 'a')
    .replaceAll('î', 'i')
    .replaceAll('ï', 'i')
    .replaceAll('ô', 'o')
    .replaceAll('ö', 'o')
    .replaceAll('ù', 'u')
    .replaceAll('û', 'u')
    .replaceAll('ü', 'u');
}

export function detectVerbGroup(lemma) {
  const base = normalizeLemma(lemma);

  if (base.endsWith('er') && base !== 'aller') {
    return 'group1';
  }

  if (base.endsWith('ir') && !base.endsWith('oir') && !base.endsWith('uir') && !THIRD_GROUP_IR_VERBS.has(base)) {
    return 'group2';
  }

  return 'group3';
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

export const VERB_GROUP_CHOICES = [
  { key: 'group1', label: '1<sup>er</sup> groupe (-ER, réguliers)' },
  { key: 'group2', label: '2<sup>ème</sup> groupe (-IR - ##ISS##)' },
  { key: 'group3', label: '3<sup>ème</sup> groupes (<em>melting pot</em> 🙃)' }
];
