<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { createQuestion, checkAnswer, computeProgression, getLevelRules, getGameModes } from "./services/quizEngine";
import { VERB_GROUP_CHOICES } from "./config/verbGroups";
import { playFinalWhistle, playTickSound, primeAudio } from "./services/timerAudio";
import { TOTAL_GAMES, VERBS_PER_GAME, clampGameNumber, createDefaultJourneyProgress, getGameState, getNextGameNumber, getJourneyBoardSize, getJourneyCellLayout } from "./config/journey";

const currentLevel = ref("A1");
const currentMode = ref("trouver_conjugaison");
const journey = ref(createDefaultJourneyProgress());
const currentQuestion = ref(null);
const answer = ref("");
const feedback = ref(null);
const loading = ref(false);
const config = ref({ levels: {}, modes: {} });
const historyByLevel = ref({});
const errorMessage = ref("");
const answerInput = ref(null);
const answerPanel = ref(null);
const answerCardPanel = ref(null);
const quizPromptCard = ref(null);
const specialCharacters = ["é", "è", "ê", "â", "î", "ô", "û"];
const timeLeft = ref(null);
const timerId = ref(null);
const soundEnabled = ref(true);
const advancingToNext = ref(false);
const selectedPoolKeysByLevel = ref({});
const selectedVerbGroups = ref(["group1", "group2", "group3"]);
const mobilePreferencesOpen = ref({
  verbGroups: false,
  tenses: false
});

let mobileAnchorFrameId = null;
let mobileFollowUpTimeoutIds = [];
let isMobileFocusActive = false;

const fallbackLevels = ["A1", "A2", "B1", "B2", "C1"];
const fallbackModes = {
  trouver_conjugaison: { label: "Trouver la conjugaison" },
  battre_la_montre: { label: "Battre la montre" },
  trouver_le_temps: { label: "Trouver le temps" },
  trouver_infinitif: { label: "Trouver l'infinitif" }
};

const levelList = computed(() => Object.keys(config.value.levels).length ? Object.keys(config.value.levels) : fallbackLevels);
const modeList = computed(() => Object.entries(config.value.modes).length ? Object.entries(config.value.modes) : Object.entries(fallbackModes));

const currentGameNumber = computed(() => clampGameNumber(journey.value.currentGame));
const currentGameState = computed(() => getGameState(journey.value, currentGameNumber.value) ?? journey.value.gameStates[0]);
const currentLevelPoolChoices = computed(() => {
  const pools = config.value.levels?.[currentLevel.value]?.pools ?? [];
  return pools.map((pool) => ({
    ...pool,
    key: buildPoolKey(pool),
    label: formatPoolLabel(pool)
  }));
});
const isCurrentLevelLockedToSingleTense = computed(() => false);

const journeyCells = computed(() => journey.value.gameStates.map((game) => ({
  ...game,
  isCurrent: game.index === currentGameNumber.value,
  isAvatar: game.index === currentGameNumber.value,
  isCompleted: game.completed,
  isLocked: !game.unlocked,
  progressPercent: Math.min(Math.round((game.attempts / VERBS_PER_GAME) * 100), 100),
  layout: getJourneyCellLayout(game.index)
})));

const journeyBoardSize = computed(() => getJourneyBoardSize());

const answerPlaceholder = computed(() => {
  if (currentMode.value === "trouver_le_temps") {
    return "Ex : Présent, Imparfait, Passé composé...";
  }

  if (currentMode.value === "trouver_infinitif") {
    return "Ex: manger, finir, prendre...";
  }

  return "Tape ta réponse";
});

const feedbackToast = computed(() => {
  if (!feedback.value) {
    return null;
  }

  const detailParts = [];

  if (feedback.value.correct) {
    detailParts.push("Continue avec Entrée ou le bouton Suivant.");
  } else if (feedback.value.expected) {
    detailParts.push(`Correction : ${feedback.value.expected}`);
  }

  if (feedback.value.chapterCompleted) {
    detailParts.push(`Partie validée : ${feedback.value.chapterCompleted}.`);
  }

  if (feedback.value.nextChapterTitle) {
    detailParts.push(`Partie suivante : ${feedback.value.nextChapterTitle}.`);
  }

  if (feedback.value.promotedTo) {
    detailParts.push(`Niveau suivant débloqué : ${feedback.value.promotedTo}.`);
  }

  return {
    tone: feedback.value.correct ? "success" : "error",
    title: feedback.value.correct ? "Bonne réponse" : "Mauvaise réponse",
    detail: detailParts.join(" ")
  };
});

function normalizeSpaces(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeLabel(value) {
  return String(value ?? "")
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatQuestionLabel(value) {
  const normalized = normalizeLabel(value);
  const displayMap = {
    indicatif: "Indicatif",
    subjonctif: "Subjonctif",
    conditionnel: "Conditionnel",
    imperatif: "Impératif",
    present: "Présent",
    imparfait: "Imparfait",
    passecompose: "Passé composé",
    passeanterieur: "Passé antérieur",
    futuranterieur: "Futur antérieur",
    passesimple: "Passé simple",
    futur: "Futur",
    futursimple: "Futur simple",
    plusqueparfait: "Plus-que-parfait",
    "passe (1ere forme)": "Passé (1ère forme)",
    passe: "Passé",
    plusqueparfaitde: "Plus-que-parfait"
  };

  return displayMap[normalized] ?? String(value ?? "");
}

function formatTenseDisplay(mood, tense) {
  const moodKey = normalizeLabel(mood);
  const tenseKey = normalizeLabel(tense);

  if (moodKey === "indicatif") {
    const indicativeMap = {
      present: "Présent",
      imparfait: "Imparfait",
      "passe compose": "Passé composé",
      "plus que parfait": "Plus-que-parfait",
      "passe simple": "Passé simple",
      "passe anterieur": "Passé antérieur",
      "futur simple": "Futur simple",
      "futur anterieur": "Futur antérieur"
    };

    const tenseLabel = indicativeMap[tenseKey] ?? formatQuestionLabel(tense);
    return `${tenseLabel} (indicatif)`;
  }

  if (moodKey === "conditionnel" && tenseKey.includes("1ere forme")) {
    return "Conditionnel passé (1<sup>ère</sup> forme)";
  }

  if (moodKey === "conditionnel" && tenseKey === "present") {
    return "Conditionnel présent";
  }

  if (moodKey === "subjonctif" && tenseKey === "present") {
    return "Subjonctif présent";
  }

  if (moodKey === "subjonctif" && tenseKey === "passe") {
    return "Subjonctif passé";
  }

  if (moodKey === "imperatif" && tenseKey === "present") {
    return "Impératif présent";
  }

  return `${formatQuestionLabel(tense)} ${formatQuestionLabel(mood)}`;
}

function startsWithElisionVowel(answer) {
  const cleaned = normalizeLabel(answer)
    // Ignore optional leading pronoun chunks if they exist in accepted variants.
    .replace(/^(que\s+|qu['’]\s*|je\s+|j['’]\s*)+/g, "")
    .replace(/^[^a-z]*/, "");

  const firstWord = cleaned.split(/\s+/)[0] ?? "";
  const firstChar = firstWord[0] ?? "";

  // Explicit rule requested: A, E, I, O, U, É (normalized to e).
  return /[aeiou]/.test(firstChar);
}

function formatPersonPrompt(person, mood, expectedAnswer = "") {
  const normalizedPerson = normalizeLabel(person);
  const normalizedMood = normalizeLabel(mood);

  if (normalizedPerson === "je") {
    if (startsWithElisionVowel(expectedAnswer)) {
      return normalizedMood.includes("subjonctif") ? "que j'" : "j'";
    }

    return normalizedMood.includes("subjonctif") ? "que je" : "je";
  }

  if (!normalizedMood.includes("subjonctif")) {
    return formatQuestionLabel(person);
  }

  if (normalizedPerson === "il/elle") {
    return "qu'il / qu'elle";
  }

  if (normalizedPerson === "ils/elles") {
    return "qu'ils / qu'elles";
  }

  return `que ${formatQuestionLabel(person)}`;
}

const questionDisplayRows = computed(() => {
  const question = currentQuestion.value;
  if (!question) {
    return [];
  }

  const mood = String(question.details?.mood ?? question.mood ?? "");
  const tense = String(question.details?.tense ?? question.tense ?? "");
  const person = String(question.details?.person ?? question.person ?? "");
  const verb = String(question.details?.displayLemma ?? question.displayLemma ?? question.lemma ?? "").toLocaleUpperCase("fr-FR");
  const kind = String(question.mode ?? currentMode.value ?? "");
  const expectedAnswer = String(question.details?.conjugatedForm ?? question.expected ?? "");

  if (kind === "trouver_le_temps") {
    return [
      { label: "Forme", value: `"${String(question.details?.conjugatedForm ?? "")}"` },
      { label: "Verbe", value: verb },
      { label: "Personne", value: formatQuestionLabel(person) }
    ];
  }

  if (kind === "trouver_infinitif") {
    return [
      { label: "Forme", value: `"${String(question.details?.conjugatedForm ?? "")}"` },
      { label: "Temps", value: formatTenseDisplay(mood, tense), html: true },
      { label: "Personne", value: formatQuestionLabel(person) }
    ];
  }

  return [
    { label: "Verbe", value: verb },
    { label: "Temps", value: formatTenseDisplay(mood, tense), html: true },
    { label: "Personne", value: formatQuestionLabel(person) }
  ].filter((row) => row.value && row.value.trim() !== "");
});

function buildPoolKey(pool) {
  return `${pool.mood}::${pool.tense}`;
}

function formatPoolLabel(pool) {
  const label = formatTenseDisplay(pool.mood, pool.tense);
  if (normalizeLabel(pool.mood) === "conditionnel" && normalizeLabel(pool.tense).includes("1ere forme")) {
    return "Conditionnel passé<br>(1<sup>ère</sup> forme)";
  }

  return label;
}

function toggleMobilePreferencePanel(panelKey) {
  mobilePreferencesOpen.value = {
    ...mobilePreferencesOpen.value,
    [panelKey]: !mobilePreferencesOpen.value[panelKey]
  };
}

function releaseAnswerFocusForPreferenceSelection() {
  if (!shouldAdjustForMobileKeyboard()) {
    return;
  }

  const inputElement = answerInput.value;
  if (inputElement && document.activeElement === inputElement) {
    inputElement.blur();
  }

  isMobileFocusActive = false;
  document.body.classList.remove("mobile-answer-focus");
  setMobileKeyboardOffset(0);
  clearMobileFocusFollowUps();
}

function isInteractiveTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, button, select, option, a, label, [contenteditable='true'], [role='button']")
  );
}

function focusAnswerInputWithRetry() {
  const inputElement = answerInput.value;
  if (!inputElement) {
    return;
  }

  inputElement.focus({ preventScroll: true });

  if (document.activeElement === inputElement || typeof window === "undefined") {
    return;
  }

  window.setTimeout(() => {
    inputElement.focus({ preventScroll: true });
  }, 0);
}

function onAnswerZonePointerDown(event) {
  if (isInteractiveTarget(event?.target)) {
    return;
  }

  event?.preventDefault();
  nextTick(() => {
    focusAnswerInputWithRetry();
  });
}

function anchorPromptToVisibleTop() {
  if (!shouldAdjustForMobileKeyboard() || typeof window === "undefined") {
    return;
  }

  const panel = quizPromptCard.value;
  if (!panel) {
    return;
  }

  const viewport = window.visualViewport;
  const viewportOffsetTop = viewport?.offsetTop ?? 0;
  const guardTop = 12;

  const rectTop = panel.getBoundingClientRect().top;
  const targetScrollY = Math.max(
    0,
    window.scrollY + rectTop - viewportOffsetTop - guardTop
  );

  if (Math.abs(targetScrollY - window.scrollY) < 2) {
    return;
  }

  window.scrollTo({ top: targetScrollY, behavior: "auto" });
}

function scheduleMobileFocusAnchors() {
  if (typeof window === "undefined") {
    return;
  }

  clearMobileFocusFollowUps();

  // Immediate pass on the next frame.
  mobileAnchorFrameId = window.requestAnimationFrame(() => {
    mobileAnchorFrameId = null;
    updateMobileKeyboardOffset();
    anchorPromptToVisibleTop();
  });

  // Follow-up passes covering the keyboard open animation across devices.
  for (const delayMs of [180, 400, 700]) {
    const timeoutId = window.setTimeout(() => {
      if (!isMobileFocusActive) {
        return;
      }
      updateMobileKeyboardOffset();
      anchorPromptToVisibleTop();
    }, delayMs);
    mobileFollowUpTimeoutIds.push(timeoutId);
  }
}

function clearMobileFocusFollowUps() {
  if (typeof window === "undefined") {
    return;
  }

  if (mobileAnchorFrameId !== null) {
    window.cancelAnimationFrame(mobileAnchorFrameId);
    mobileAnchorFrameId = null;
  }

  for (const timeoutId of mobileFollowUpTimeoutIds) {
    window.clearTimeout(timeoutId);
  }
  mobileFollowUpTimeoutIds = [];
}

function onAnswerFocus() {
  if (!shouldAdjustForMobileKeyboard()) {
    return;
  }

  isMobileFocusActive = true;
  document.body.classList.add("mobile-answer-focus");
  updateMobileKeyboardOffset();
  scheduleMobileFocusAnchors();
}

function onAnswerBlur() {
  if (typeof document === "undefined") {
    return;
  }

  isMobileFocusActive = false;
  document.body.classList.remove("mobile-answer-focus");
  setMobileKeyboardOffset(0);
  clearMobileFocusFollowUps();
}

function onViewportResize() {
  updateMobileKeyboardOffset();
  if (isMobileFocusActive) {
    anchorPromptToVisibleTop();
  }
}

function onViewportScroll() {
  if (!isMobileFocusActive || typeof window === "undefined") {
    return;
  }

  const panel = quizPromptCard.value;
  if (!panel) {
    return;
  }

  const viewport = window.visualViewport;
  const viewportOffsetTop = viewport?.offsetTop ?? 0;
  const rectTop = panel.getBoundingClientRect().top;

  // Re-anchor if the browser drifted the prompt off the visible viewport top.
  if (rectTop < viewportOffsetTop - 4 || rectTop > viewportOffsetTop + 48) {
    anchorPromptToVisibleTop();
  }
}

function initLevelPoolSelection(level) {
  const pools = config.value.levels?.[level]?.pools ?? [];
  selectedPoolKeysByLevel.value[level] = pools.map((pool) => buildPoolKey(pool));
}

function initAllPoolSelections() {
  for (const level of Object.keys(config.value.levels ?? {})) {
    initLevelPoolSelection(level);
  }
}

function ensureCurrentLevelPoolSelection() {
  if (!selectedPoolKeysByLevel.value[currentLevel.value]) {
    initLevelPoolSelection(currentLevel.value);
  }
}

function isPoolSelected(poolKey) {
  const selected = selectedPoolKeysByLevel.value[currentLevel.value] ?? [];
  return selected.includes(poolKey);
}

function onPoolToggle(poolKey, event) {
  if (isCurrentLevelLockedToSingleTense.value) {
    if (event?.target) {
      event.target.checked = true;
    }
    return;
  }

  ensureCurrentLevelPoolSelection();
  const selected = [...(selectedPoolKeysByLevel.value[currentLevel.value] ?? [])];
  const isChecked = Boolean(event?.target?.checked);

  if (isChecked) {
    if (!selected.includes(poolKey)) {
      selected.push(poolKey);
    }
    selectedPoolKeysByLevel.value[currentLevel.value] = selected;
    loadQuestion().catch(() => {});
    return;
  }

  if (selected.length <= 1) {
    if (event?.target) {
      event.target.checked = true;
    }
    return;
  }

  selectedPoolKeysByLevel.value[currentLevel.value] = selected.filter((key) => key !== poolKey);
  loadQuestion().catch(() => {});
}

function isVerbGroupSelected(groupKey) {
  return selectedVerbGroups.value.includes(groupKey);
}

function onVerbGroupToggle(groupKey, event) {
  const selected = [...selectedVerbGroups.value];
  const isChecked = Boolean(event?.target?.checked);

  if (isChecked) {
    if (!selected.includes(groupKey)) {
      selected.push(groupKey);
    }
    selectedVerbGroups.value = selected;
    loadQuestion().catch(() => {});
    return;
  }

  if (selected.length <= 1) {
    if (event?.target) {
      event.target.checked = true;
    }
    return;
  }

  selectedVerbGroups.value = selected.filter((key) => key !== groupKey);
  loadQuestion().catch(() => {});
}

function getCurrentPoolDefinitions() {
  ensureCurrentLevelPoolSelection();
  const selectedKeys = new Set(selectedPoolKeysByLevel.value[currentLevel.value] ?? []);
  const pools = config.value.levels?.[currentLevel.value]?.pools ?? [];
  return pools.filter((pool) => selectedKeys.has(buildPoolKey(pool)));
}

const answerPersonPrompt = computed(() => {
  const person = currentQuestion.value?.details?.person;
  if (!person) {
    return "";
  }

  const mood = normalizeLabel(currentQuestion.value?.details?.mood);
  const tense = normalizeLabel(currentQuestion.value?.details?.tense);
  if (mood === "imperatif" && tense === "present") {
    return "";
  }

  const expectedAnswer =
    currentQuestion.value?.details?.conjugatedForm ||
    currentQuestion.value?.expected ||
    currentQuestion.value?.acceptedAnswers?.[0] ||
    "";
  const typedAnswer = String(answer.value ?? "");
  const referenceAnswer = typedAnswer.trim() ? typedAnswer : expectedAnswer;
  return formatPersonPrompt(person, mood, referenceAnswer);
});

function shouldAdjustForMobileKeyboard() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(max-width: 640px)").matches;
}

function setMobileKeyboardOffset(px) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty("--mobile-keyboard-offset", `${Math.max(0, px)}px`);
}

function updateMobileKeyboardOffset() {
  if (!shouldAdjustForMobileKeyboard() || typeof window === "undefined") {
    setMobileKeyboardOffset(0);
    return;
  }

  const viewport = window.visualViewport;
  if (!viewport) {
    setMobileKeyboardOffset(0);
    return;
  }

  const keyboardHeight = window.innerHeight - viewport.height;
  setMobileKeyboardOffset(keyboardHeight);
}

async function goToNextQuestionOnAnyKey() {
  if (!feedback.value || loading.value || advancingToNext.value) {
    return;
  }

  advancingToNext.value = true;
  try {
    feedback.value = null;
    await loadQuestion();
  } finally {
    advancingToNext.value = false;
  }
}

function goToNextQuestion() {
  goToNextQuestionOnAnyKey().catch(() => {});
}

function onWindowKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }

  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
      return;
    }
  }

  if (event.repeat) {
    return;
  }

  goToNextQuestionOnAnyKey().catch(() => {});
}

function onEnterInAnswerField(event) {
  event?.preventDefault();
  event?.stopPropagation();

  if (feedback.value) {
    goToNextQuestionOnAnyKey().catch(() => {});
    return;
  }

  validateAnswer().catch(() => {});
}

function ensureHistoryBucket(level) {
  if (!historyByLevel.value[level]) {
    historyByLevel.value[level] = [];
  }
}

function saveJourneyProgress() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    "conjugaison.journeyProgress.v1",
    JSON.stringify(journey.value)
  );
}

function loadJourneyProgress() {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem("conjugaison.journeyProgress.v1");
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const defaultState = createDefaultJourneyProgress();
    journey.value = {
      ...defaultState,
      ...parsed,
      currentGame: clampGameNumber(parsed.currentGame ?? defaultState.currentGame),
      gameStates: defaultState.gameStates.map((game, index) => ({
        ...game,
        ...(parsed.gameStates?.[index] ?? {})
      }))
    };
  } catch {
    journey.value = createDefaultJourneyProgress();
  }
}

function syncLevelWithGame(gameNumber) {
  const game = journey.value.gameStates[clampGameNumber(gameNumber) - 1];
  if (!game) {
    return;
  }

  currentLevel.value = game.index <= 20 ? "A1" : game.index <= 40 ? "A2" : game.index <= 80 ? "B1" : game.index <= 140 ? "B2" : "C1";
}

function setCurrentGame(gameNumber) {
  const game = journey.value.gameStates[clampGameNumber(gameNumber) - 1];
  if (!game || !game.unlocked) {
    return;
  }

  journey.value.currentGame = game.index;
  syncLevelWithGame(game.index);
  loadQuestion().catch(() => {});
}

function onLevelChange() {
  const chapterLikeGame = currentLevel.value === "A1" ? 1 : currentLevel.value === "A2" ? 21 : currentLevel.value === "B1" ? 41 : currentLevel.value === "B2" ? 81 : 141;
  journey.value.currentGame = chapterLikeGame;
  syncLevelWithGame(chapterLikeGame);
  ensureCurrentLevelPoolSelection();
  loadQuestion().catch(() => {});
}

function stopTimer() {
  if (timerId.value) {
    clearInterval(timerId.value);
    timerId.value = null;
  }
  timeLeft.value = null;
}

async function handleTimeExpired() {
  if (!currentQuestion.value || loading.value) {
    return;
  }

  if (soundEnabled.value) {
    playFinalWhistle().catch(() => {});
  }

  await validateAnswer(true);
}

function startTimer(seconds) {
  stopTimer();

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return;
  }

  timeLeft.value = seconds;
  timerId.value = setInterval(() => {
    if (timeLeft.value === null) {
      return;
    }

    timeLeft.value -= 1;

    if (soundEnabled.value && timeLeft.value > 0) {
      playTickSound().catch(() => {});
    }

    if (timeLeft.value <= 0) {
      stopTimer();
      handleTimeExpired();
    }
  }, 1000);
}

function insertSpecialCharacter(character) {
  primeAudio().catch(() => {});
  const inputElement = answerInput.value;

  if (!inputElement) {
    answer.value += character;
    return;
  }

  const start = inputElement.selectionStart ?? answer.value.length;
  const end = inputElement.selectionEnd ?? answer.value.length;

  answer.value = `${answer.value.slice(0, start)}${character}${answer.value.slice(end)}`;

  const nextPosition = start + character.length;
  inputElement.focus();
  inputElement.setSelectionRange(nextPosition, nextPosition);
}

async function loadQuestion() {
  primeAudio().catch(() => {});
  stopTimer();
  loading.value = true;
  errorMessage.value = "";
  feedback.value = null;

  try {
    if (selectedVerbGroups.value.length === 0) {
      throw new Error("Choisis au moins un groupe de verbes.");
    }

    const selectedPoolDefinitions = getCurrentPoolDefinitions();
    if (selectedPoolDefinitions.length === 0) {
      throw new Error("Choisis au moins un temps.");
    }

    const payload = createQuestion(currentLevel.value, currentMode.value, {
      poolDefinitions: selectedPoolDefinitions,
      verbGroups: selectedVerbGroups.value
    });
    if (!payload) {
      throw new Error("Aucune question disponible pour ce niveau.");
    }
    currentQuestion.value = payload;
    answer.value = "";

    if (payload.timeLimitSeconds) {
      startTimer(payload.timeLimitSeconds);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function validateAnswer(forceSubmit = false) {
  primeAudio().catch(() => {});
  if (!currentQuestion.value) {
    return;
  }

  if (!forceSubmit && !answer.value.trim()) {
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  stopTimer();

  try {
    const result = checkAnswer(currentQuestion.value.questionId, answer.value);
    const expectedAnswer = currentQuestion.value.expected ?? result.expected ?? "";
    const normalizedUserAnswer = normalizeSpaces(answer.value);
    const normalizedExpectedAnswer = normalizeSpaces(expectedAnswer);

    feedback.value = {
      ...result,
      expected: expectedAnswer,
      correct: result.correct || Boolean(expectedAnswer && normalizedUserAnswer === normalizedExpectedAnswer)
    };

    ensureHistoryBucket(currentLevel.value);
    historyByLevel.value[currentLevel.value].push(feedback.value.correct);

    const currentGameStateValue = journey.value.gameStates[currentGameNumber.value - 1];
    if (currentGameStateValue) {
      currentGameStateValue.attempts += 1;
      if (feedback.value.correct) {
        currentGameStateValue.correct += 1;
      }

      if (currentGameStateValue.attempts >= VERBS_PER_GAME) {
        currentGameStateValue.completed = true;
        if (currentGameNumber.value < TOTAL_GAMES) {
          const nextGameNumber = getNextGameNumber(currentGameNumber.value);
          journey.value.currentGame = nextGameNumber;
          journey.value.gameStates[nextGameNumber - 1].unlocked = true;
          syncLevelWithGame(nextGameNumber);
          feedback.value = {
            ...feedback.value,
            chapterCompleted: `Partie ${currentGameNumber.value}`,
            nextChapterTitle: `Partie ${nextGameNumber}`
          };
        }
      }
    }

    saveJourneyProgress();

    const progression = computeProgression(currentLevel.value, historyByLevel.value[currentLevel.value]);

    if (progression.promoted && progression.nextLevel) {
      feedback.value = {
        ...feedback.value,
        promotedTo: progression.nextLevel
      };
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  window.addEventListener("keydown", onWindowKeydown);
  window.visualViewport?.addEventListener("resize", onViewportResize);
  window.visualViewport?.addEventListener("scroll", onViewportScroll);
  updateMobileKeyboardOffset();
  loadJourneyProgress();

  try {
    const payload = {
      levels: getLevelRules(),
      modes: getGameModes()
    };
    config.value = payload;
    initAllPoolSelections();

    if (!payload.levels[currentLevel.value]) {
      currentLevel.value = Object.keys(payload.levels)[0] ?? fallbackLevels[0];
    }

    if (!payload.modes[currentMode.value]) {
      currentMode.value = Object.keys(payload.modes)[0] ?? Object.keys(fallbackModes)[0];
    }

    syncLevelWithGame(journey.value.currentGame);
    ensureHistoryBucket(currentLevel.value);
    await loadQuestion();
  } catch (error) {
    errorMessage.value = error.message;
    config.value = {
      levels: getLevelRules(),
      modes: fallbackModes
    };
    initAllPoolSelections();
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  window.visualViewport?.removeEventListener("resize", onViewportResize);
  window.visualViewport?.removeEventListener("scroll", onViewportScroll);
  isMobileFocusActive = false;
  clearMobileFocusFollowUps();

  document.body.classList.remove("mobile-answer-focus");
  setMobileKeyboardOffset(0);
  stopTimer();
});
</script>

<template>
  <main class="page">
    <div class="autofill-guard" aria-hidden="true">
      <input type="text" name="game-decoy" autocomplete="off" tabindex="-1" />
      <input type="text" name="game-session-code" autocomplete="one-time-code" tabindex="-1" />
    </div>

    <p class="app-credit">développé par Julien Martinez-Monniello - 2026</p>
    <aside class="journey-rail" aria-label="Parcours de 200 parties">
      <div class="journey-rail-header">
        <p class="journey-rail-kicker">Parcours</p>
        <h2>200 parties</h2>
        <p class="journey-rail-subtitle">10 verbes par partie</p>
      </div>

      <div class="journey-track journey-board" :style="{ width: `${journeyBoardSize.width}px`, height: `${journeyBoardSize.height}px` }">
        <div
          v-for="cell in journeyCells"
          :key="cell.index"
          class="journey-cell"
          :class="{
            'is-current': cell.isCurrent,
            'is-completed': cell.isCompleted,
            'is-locked': cell.isLocked,
            'is-street': cell.layout.street,
            'is-corner': cell.layout.corner
          }"
          :title="`Partie ${cell.index}`"
          :style="{
            left: `${cell.layout.x}px`,
            top: `${cell.layout.y}px`,
            width: `${cell.layout.width}px`,
            height: `${cell.layout.height}px`
          }"
        >
          <span class="journey-cell-number">{{ cell.index }}</span>
          <span v-if="cell.isAvatar" class="journey-avatar">🧍</span>
          <span class="journey-cell-progress" aria-hidden="true">
            <span :style="{ width: `${cell.progressPercent}%` }"></span>
          </span>
        </div>
      </div>
    </aside>

    <div class="game-stage">
      <section class="card hero">
        <p class="kicker">Les stars de la conjugaison</p>
        <h1>Entraîne-toi et deviens imbattable !</h1>
        <p class="subtitle">Niveaux CECRL, correction instantanée et progression automatique.</p>

        <div class="controls">
          <label class="level-control">
            Niveau
            <select v-model="currentLevel" @change="onLevelChange">
              <option v-for="level in levelList" :key="level" :value="level">{{ level }}</option>
            </select>
          </label>
          <label v-if="false" class="locked-control">
            Mode
            <select v-model="currentMode" @change="loadQuestion" disabled aria-disabled="true">
              <option v-for="[key, mode] in modeList" :key="key" :value="key">{{ mode.label }}</option>
            </select>
          </label>
          <button class="hero-primary-action" @click="loadQuestion" :disabled="loading">Commencer</button>
        </div>

        <div class="preference-row">
          <div class="tense-filter-box" :class="{ 'is-open': mobilePreferencesOpen.verbGroups }" @pointerdown.capture="releaseAnswerFocusForPreferenceSelection">
            <button
              type="button"
              class="tense-filter-toggle"
              :aria-expanded="mobilePreferencesOpen.verbGroups ? 'true' : 'false'"
              @click="toggleMobilePreferencePanel('verbGroups')"
            >
              <span>
                <span class="tense-filter-title">Groupes de verbes</span>
              </span>
              <span class="tense-filter-chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="tense-filter-content" v-show="mobilePreferencesOpen.verbGroups">
            <div class="tense-filter-grid">
              <label
                v-for="choice in VERB_GROUP_CHOICES"
                :key="choice.key"
                class="tense-filter-option"
              >
                <input
                  type="checkbox"
                  :checked="isVerbGroupSelected(choice.key)"
                  @change="onVerbGroupToggle(choice.key, $event)"
                />
                <span v-html="choice.label"></span>
              </label>
            </div>
            </div>
          </div>

          <div class="tense-filter-box" :class="{ 'is-open': mobilePreferencesOpen.tenses }" @pointerdown.capture="releaseAnswerFocusForPreferenceSelection">
            <button
              type="button"
              class="tense-filter-toggle"
              :aria-expanded="mobilePreferencesOpen.tenses ? 'true' : 'false'"
              @click="toggleMobilePreferencePanel('tenses')"
            >
              <span>
                <span class="tense-filter-title">Temps d'entraînement</span>
              </span>
              <span class="tense-filter-chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="tense-filter-content" v-show="mobilePreferencesOpen.tenses">
            <div class="tense-filter-grid">
              <label
                v-for="pool in currentLevelPoolChoices"
                :key="pool.key"
                class="tense-filter-option"
                :class="{ 'is-disabled': isCurrentLevelLockedToSingleTense }"
              >
                <input
                  type="checkbox"
                  :checked="isPoolSelected(pool.key)"
                  :disabled="isCurrentLevelLockedToSingleTense"
                  @change="onPoolToggle(pool.key, $event)"
                />
                <span v-html="pool.label"></span>
              </label>
            </div>
            </div>
          </div>
        </div>

      </section>

      <section class="card quiz" v-if="currentQuestion" ref="answerPanel">
        <div ref="quizPromptCard" class="quiz-main-card" :class="{ 'has-toast': feedbackToast }">
          <Transition name="feedback-toast">
            <div
              v-if="feedbackToast"
              class="feedback-toast"
              :class="`is-${feedbackToast.tone}`"
              role="status"
              aria-live="polite"
            >
              <p class="feedback-toast-title">{{ feedbackToast.title }}</p>
              <p v-if="feedbackToast.detail" class="feedback-toast-detail">{{ feedbackToast.detail }}</p>
            </div>
          </Transition>
          <p class="quiz-badge">Défi en cours</p>
          <h2>
            <span class="question-meta">
              <span v-for="row in questionDisplayRows" :key="row.label" class="question-meta-row">
                <span class="question-meta-label">{{ row.label }} :</span>
                <strong v-if="row.html" v-html="row.value"></strong>
                <strong v-else>{{ row.value }}</strong>
              </span>
            </span>
          </h2>
        </div>

        <p v-if="timeLeft !== null" class="timer-inline">Temps restant: {{ timeLeft }}s</p>

        <div class="answer-panel" ref="answerCardPanel" @pointerdown="onAnswerZonePointerDown">
          <div class="answer-row" :class="{ 'answer-row--with-person': answerPersonPrompt }">
            <span class="answer-person-prefix" :class="{ 'is-hidden': !answerPersonPrompt }">{{ answerPersonPrompt }}</span>
            <input
              id="answer-input"
              class="answer-input"
              ref="answerInput"
              v-model="answer"
              name="conjugation-answer"
              type="text"
              :placeholder="answerPlaceholder"
              aria-label="Ta réponse"
              autocomplete="one-time-code"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              inputmode="text"
              aria-autocomplete="none"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              enterkeyhint="go"
              @focus="onAnswerFocus"
              @blur="onAnswerBlur"
              @keydown.enter.prevent="onEnterInAnswerField"
              @keyup.enter.prevent.stop
            />
          </div>

          <div class="special-keyboard">
            <span class="special-keyboard-label">Caractères :</span>
            <button
              v-for="character in specialCharacters"
              :key="character"
              type="button"
              class="special-key"
              @click="insertSpecialCharacter(character)"
            >
              {{ character }}
            </button>
          </div>

          <div class="answer-actions">
            <button type="button" @click="validateAnswer" :disabled="loading">Vérifier</button>
            <button
              type="button"
              class="next-button"
              @click="goToNextQuestion"
              :disabled="!feedback || loading || advancingToNext"
            >
              Suivant
            </button>
          </div>
        </div>

        <p v-if="errorMessage" class="ko">{{ errorMessage }}</p>
      </section>

    </div>
  </main>
</template>
