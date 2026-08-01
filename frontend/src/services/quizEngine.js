import { LEVEL_RULES } from '../config/cecrl.js';
import { A1_PRIORITY_IRREGULARS } from '../config/a1Verbs.js';
import { GLOBAL_ALLOWED_VERBS } from '../config/allowedVerbs.js';
import { normalizeKey, normalizeText } from './normalize.js';
import verbs from './verbesData.js';

const QUESTION_TTL_MS = 1000 * 60 * 10;
const questionStore = new Map();
const DEFAULT_MODE = 'trouver_conjugaison';

const GAME_MODES = {
  trouver_conjugaison: { label: 'Trouver la conjugaison' },
  battre_la_montre: { label: 'Battre la montre', timeLimitSeconds: 12 },
  trouver_le_temps: { label: 'Trouver le temps' },
  trouver_infinitif: { label: "Trouver l'infinitif" }
};

const PERSON_LABELS = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

function ensureLevel(level) {
  return LEVEL_RULES[level] ? level : 'A1';
}

function ensureMode(mode) {
  return mode && GAME_MODES[mode] ? mode : DEFAULT_MODE;
}

function normalizeLemma(lemma) {
  return normalizeKey(lemma);
}

function expandReflexiveVariants(lemmas) {
  const expanded = new Set();
  for (const lemma of lemmas) {
    expanded.add(lemma);
    const normalized = normalizeLemma(lemma);
    if (normalized.startsWith('se ')) {
      expanded.add(lemma.slice(3));
    }
    if (normalized.startsWith("s'")) {
      expanded.add(lemma.slice(2));
    }
  }
  return Array.from(expanded);
}

function expandGloballyAllowedVerbs() {
  return expandReflexiveVariants(GLOBAL_ALLOWED_VERBS);
}

function buildQuestionByMode(mode, selected) {
  if (mode === 'trouver_le_temps') {
    return {
      prompt: `Trouve le temps de "${selected.expected}" (${selected.personLabel}) pour ${selected.lemma}`,
      expected: selected.tenseRaw,
      matchStrategy: 'key',
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel
      }
    };
  }

  if (mode === 'trouver_infinitif') {
    return {
      prompt: `Trouve l'infinitif de "${selected.expected}" (${selected.personLabel}, ${selected.moodRaw} ${selected.tenseRaw})`,
      expected: selected.lemma,
      matchStrategy: 'key',
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel,
        mood: selected.moodRaw,
        tense: selected.tenseRaw
      }
    };
  }

  return {
    prompt: `Conjugue ${selected.lemma} - ${selected.moodRaw} ${selected.tenseRaw} - ${selected.personLabel}`,
    expected: selected.expected,
    matchStrategy: 'text',
    details: {
      person: selected.personLabel,
      mood: selected.moodRaw,
      tense: selected.tenseRaw
    }
  };
}

function isAnswerCorrect(expected, answer, strategy) {
  if (strategy === 'key') {
    return normalizeKey(expected) === normalizeKey(answer);
  }
  return normalizeText(expected) === normalizeText(answer);
}

function cleanExpiredQuestions() {
  const now = Date.now();
  for (const [id, value] of questionStore.entries()) {
    if (now - value.createdAt > QUESTION_TTL_MS) {
      questionStore.delete(id);
    }
  }
}

function getLemma(entry) {
  return entry?.infinitif?.['présent']?.[0] ?? 'verbe inconnu';
}

function isSixPersonTense(forms) {
  return Array.isArray(forms) && forms.length === 6 && forms.every((form) => typeof form === 'string');
}

function buildTenseIndex(entry) {
  const index = [];
  for (const [moodName, moodValue] of Object.entries(entry)) {
    if (!moodValue || typeof moodValue !== 'object') {
      continue;
    }
    for (const [tenseName, forms] of Object.entries(moodValue)) {
      if (!isSixPersonTense(forms)) {
        continue;
      }
      index.push({
        mood: normalizeKey(moodName),
        tense: normalizeKey(tenseName),
        moodRaw: moodName,
        tenseRaw: tenseName,
        forms
      });
    }
  }
  return index;
}

function getEntries() {
  return (verbs ?? []).map((entry) => {
    const lemma = getLemma(entry);
    return {
      lemma,
      tenses: buildTenseIndex(entry)
    };
  }).filter((entry) => entry.tenses.length > 0);
}

function pickQuestion(poolDefinitions, options = {}) {
  const entries = getEntries();
  if (!Array.isArray(poolDefinitions) || poolDefinitions.length === 0 || entries.length === 0) {
    return null;
  }

  const allowedSet = new Set((options.allowedLemmas ?? []).map((lemma) => normalizeLemma(lemma)));
  const prioritySet = new Set((options.prioritizedLemmas ?? []).map((lemma) => normalizeLemma(lemma)));
  const useAllowedSet = allowedSet.size > 0;

  const eligible = [];
  const priorityEligible = [];

  for (const verb of entries) {
    const normalizedLemma = normalizeLemma(verb.lemma);
    if (useAllowedSet && !allowedSet.has(normalizedLemma)) {
      continue;
    }

    for (const tense of verb.tenses) {
      const match = poolDefinitions.some((pool) => tense.mood === normalizeKey(pool.mood) && tense.tense === normalizeKey(pool.tense));
      if (!match) {
        continue;
      }

      for (let personIndex = 0; personIndex < tense.forms.length; personIndex += 1) {
        const candidate = {
          lemma: verb.lemma,
          mood: tense.mood,
          tense: tense.tense,
          moodRaw: tense.moodRaw,
          tenseRaw: tense.tenseRaw,
          personIndex,
          personLabel: PERSON_LABELS[personIndex],
          expected: tense.forms[personIndex]
        };
        eligible.push(candidate);
        if (prioritySet.has(normalizedLemma)) {
          priorityEligible.push(candidate);
        }
      }
    }
  }

  if (eligible.length === 0) {
    return null;
  }

  const priorityWeight = Number.isFinite(options.priorityWeight) ? options.priorityWeight : 0;
  const shouldPickPriority = priorityEligible.length > 0 && priorityWeight > 0 && (options.random?.() ?? Math.random()) < Math.min(Math.max(priorityWeight, 0), 1);

  const source = shouldPickPriority ? priorityEligible : eligible;
  const randomIndex = Math.floor((options.random?.() ?? Math.random()) * source.length);
  return source[randomIndex];
}

export function getLevelRules() {
  return LEVEL_RULES;
}

export function getGameModes() {
  return GAME_MODES;
}

export function createQuestion(level, mode, options = {}) {
  cleanExpiredQuestions();
  const safeLevel = ensureLevel(level);
  const safeMode = ensureMode(mode);
  const pool = LEVEL_RULES[safeLevel].pools;

  const pickOptions = {
    allowedLemmas: expandGloballyAllowedVerbs()
  };

  if (safeLevel === 'A1') {
    pickOptions.prioritizedLemmas = A1_PRIORITY_IRREGULARS;
    pickOptions.priorityWeight = 0.55;
  }

  const selected = pickQuestion(pool, { ...pickOptions, ...options });
  if (!selected) {
    return null;
  }

  const modeQuestion = buildQuestionByMode(safeMode, selected);
  const questionId = crypto.randomUUID();

  questionStore.set(questionId, {
    createdAt: Date.now(),
    expected: modeQuestion.expected,
    level: safeLevel,
    mode: safeMode,
    matchStrategy: modeQuestion.matchStrategy
  });

  return {
    questionId,
    level: safeLevel,
    mode: safeMode,
    lemma: selected.lemma,
    mood: selected.moodRaw,
    tense: selected.tenseRaw,
    person: selected.personLabel,
    prompt: modeQuestion.prompt,
    timeLimitSeconds: GAME_MODES[safeMode].timeLimitSeconds ?? null,
    details: modeQuestion.details,
    expected: modeQuestion.expected
  };
}

export function checkAnswer(questionId, answer) {
  cleanExpiredQuestions();
  const snapshot = questionStore.get(questionId);
  if (!snapshot) {
    return { error: 'QUESTION_EXPIREE' };
  }

  questionStore.delete(questionId);
  return {
    correct: isAnswerCorrect(snapshot.expected, answer, snapshot.matchStrategy),
    expected: snapshot.expected,
    answer: typeof answer === 'string' ? answer : '',
    level: snapshot.level,
    mode: snapshot.mode
  };
}

export function computeProgression(level, history) {
  const safeLevel = ensureLevel(level);
  const currentIndex = Object.keys(LEVEL_RULES).indexOf(safeLevel);
  const nextLevel = Object.keys(LEVEL_RULES)[currentIndex + 1] ?? null;
  const rules = LEVEL_RULES[safeLevel];

  if (!history.length) {
    return { nextLevel, promoted: false, successRate: 0 };
  }

  const total = history.length;
  const successCount = history.filter(Boolean).length;
  const successRate = successCount / total;
  const promoted = Boolean(nextLevel && total >= rules.minQuestions && successRate >= rules.successRateToPromote);

  return {
    nextLevel,
    promoted,
    successRate
  };
}
