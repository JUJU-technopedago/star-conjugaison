import crypto from "node:crypto";
import { LEVEL_ORDER, LEVEL_RULES } from "../config/cecrl.js";
import { A1_PRIORITY_IRREGULARS } from "../config/a1Verbs.js";
import { GLOBAL_ALLOWED_VERBS } from "../config/allowedVerbs.js";
import { normalizeKey, normalizeText } from "../utils/normalize.js";
import { conjugationService } from "./conjugationService.js";

const QUESTION_TTL_MS = 1000 * 60 * 10;
const questionStore = new Map();
const DEFAULT_MODE = "trouver_conjugaison";

const GAME_MODES = {
  trouver_conjugaison: {
    label: "Trouver la conjugaison"
  },
  battre_la_montre: {
    label: "Battre la montre",
    timeLimitSeconds: 12
  },
  trouver_le_temps: {
    label: "Trouver le temps"
  },
  trouver_infinitif: {
    label: "Trouver l'infinitif"
  }
};

function cleanExpiredQuestions() {
  const now = Date.now();
  for (const [id, value] of questionStore.entries()) {
    if (now - value.createdAt > QUESTION_TTL_MS) {
      questionStore.delete(id);
    }
  }
}

function ensureLevel(level) {
  if (LEVEL_RULES[level]) {
    return level;
  }
  return "A1";
}

function ensureMode(mode) {
  if (mode && GAME_MODES[mode]) {
    return mode;
  }
  return DEFAULT_MODE;
}

function expandReflexiveVariants(lemmas) {
  const expanded = new Set();

  for (const lemma of lemmas) {
    expanded.add(lemma);

    const normalized = normalizeKey(lemma);
    if (normalized.startsWith("se ")) {
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
  if (mode === "trouver_le_temps") {
    return {
      prompt: `Trouve le temps de "${selected.expected}" (${selected.personLabel}) pour ${selected.lemma}`,
      expected: selected.tenseRaw,
      matchStrategy: "key",
      details: {
        conjugatedForm: selected.expected,
        person: selected.personLabel
      }
    };
  }

  if (mode === "trouver_infinitif") {
    return {
      prompt: `Trouve l'infinitif de "${selected.expected}" (${selected.personLabel}, ${selected.moodRaw} ${selected.tenseRaw})`,
      expected: selected.lemma,
      matchStrategy: "key",
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
    matchStrategy: "text",
    details: {
      person: selected.personLabel,
      mood: selected.moodRaw,
      tense: selected.tenseRaw
    }
  };
}

function isAnswerCorrect(expected, answer, strategy) {
  if (strategy === "key") {
    return normalizeKey(expected) === normalizeKey(answer);
  }

  return normalizeText(expected) === normalizeText(answer);
}

export function getLevelRules() {
  return LEVEL_RULES;
}

export function getGameModes() {
  return GAME_MODES;
}

export function createQuestion(level, mode) {
  cleanExpiredQuestions();

  const safeLevel = ensureLevel(level);
  const safeMode = ensureMode(mode);
  const pool = LEVEL_RULES[safeLevel].pools;

  const pickOptions = {
    allowedLemmas: expandGloballyAllowedVerbs()
  };
  if (safeLevel === "A1") {
    pickOptions.prioritizedLemmas = A1_PRIORITY_IRREGULARS;
    pickOptions.priorityWeight = 0.55;
  }

  const selected = conjugationService.pickQuestion(pool, pickOptions);

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
    details: modeQuestion.details
  };
}

export function checkAnswer(questionId, answer) {
  cleanExpiredQuestions();

  const snapshot = questionStore.get(questionId);
  if (!snapshot) {
    return { error: "QUESTION_EXPIREE" };
  }

  questionStore.delete(questionId);

  const isCorrect = isAnswerCorrect(snapshot.expected, answer, snapshot.matchStrategy);

  return {
    correct: isCorrect,
    expected: snapshot.expected,
    answer: typeof answer === "string" ? answer : "",
    level: snapshot.level,
    mode: snapshot.mode
  };
}

export function computeProgression(level, history) {
  const safeLevel = ensureLevel(level);
  const currentIndex = LEVEL_ORDER.indexOf(safeLevel);
  const nextLevel = LEVEL_ORDER[currentIndex + 1] ?? null;
  const rules = LEVEL_RULES[safeLevel];

  if (!history.length) {
    return { nextLevel, promoted: false, successRate: 0 };
  }

  const total = history.length;
  const successCount = history.filter(Boolean).length;
  const successRate = successCount / total;

  const promoted = Boolean(
    nextLevel &&
    total >= rules.minQuestions &&
    successRate >= rules.successRateToPromote
  );

  return {
    nextLevel,
    promoted,
    successRate
  };
}
