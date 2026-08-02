<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { createQuestion, checkAnswer, computeProgression, getLevelRules, getGameModes } from "./services/quizEngine";
import { normalizeText } from "./services/normalize";
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
const specialCharacters = ["é", "è", "ê", "â", "î", "ô", "û"];
const timeLeft = ref(null);
const timerId = ref(null);
const soundEnabled = ref(true);
const advancingToNext = ref(false);

const fallbackLevels = ["A1", "A2", "B1", "B2", "C1"];
const fallbackModes = {
  trouver_conjugaison: { label: "Trouver la conjugaison" },
  battre_la_montre: { label: "Battre la montre" },
  trouver_le_temps: { label: "Trouver le temps" },
  trouver_infinitif: { label: "Trouver l'infinitif" }
};

const score = computed(() => {
  const all = Object.values(historyByLevel.value).flat();
  if (!all.length) {
    return { total: 0, correct: 0, rate: 0 };
  }
  const correct = all.filter(Boolean).length;
  return {
    total: all.length,
    correct,
    rate: Math.round((correct / all.length) * 100)
  };
});

const levelList = computed(() => Object.keys(config.value.levels).length ? Object.keys(config.value.levels) : fallbackLevels);
const modeList = computed(() => Object.entries(config.value.modes).length ? Object.entries(config.value.modes) : Object.entries(fallbackModes));

const currentGameNumber = computed(() => clampGameNumber(journey.value.currentGame));
const currentGameState = computed(() => getGameState(journey.value, currentGameNumber.value) ?? journey.value.gameStates[0]);

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
    return "Ex : présent, imparfait, passé composé...";
  }

  if (currentMode.value === "trouver_infinitif") {
    return "Ex: manger, finir, prendre...";
  }

  return "Tape ta réponse";
});

const answerPersonPrompt = computed(() => {
  const person = currentQuestion.value?.details?.person;
  if (!person) {
    return "";
  }

  const mood = String(currentQuestion.value?.details?.mood ?? "").toLocaleLowerCase("fr-FR");
  if (mood.includes("subjonctif")) {
    return `que ${person}`;
  }

  return person;
});

async function focusAnswerField() {
  await nextTick();

  const inputElement = answerInput.value;
  if (!inputElement) {
    return;
  }

  inputElement.focus({ preventScroll: true });
  const cursorPosition = answer.value.length;
  inputElement.setSelectionRange(cursorPosition, cursorPosition);
}

async function goToNextQuestionOnAnyKey() {
  if (!feedback.value || loading.value || advancingToNext.value) {
    return;
  }

  advancingToNext.value = true;
  try {
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

  if (event.repeat) {
    return;
  }

  goToNextQuestionOnAnyKey().catch(() => {});
}

function onEnterInAnswerField() {
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
    const payload = createQuestion(currentLevel.value, currentMode.value);
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
    focusAnswerField().catch(() => {});
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
    const normalizedUserAnswer = normalizeText(answer.value);
    const normalizedExpectedAnswer = normalizeText(expectedAnswer);

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
  loadJourneyProgress();

  try {
    const payload = {
      levels: getLevelRules(),
      modes: getGameModes()
    };
    config.value = payload;

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
      levels: Object.fromEntries(fallbackLevels.map((level) => [level, {}])),
      modes: fallbackModes
    };
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  stopTimer();
});
</script>

<template>
  <main class="page">
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

        <div class="chapter-summary">
          <div>
            <p class="chapter-summary-label">Partie en cours</p>
            <p class="chapter-summary-title">Partie {{ currentGameNumber }}</p>
            <p class="chapter-summary-subtitle">{{ VERBS_PER_GAME }} verbes à valider</p>
          </div>
          <div class="chapter-summary-meta">
            <span>{{ currentLevel }}</span>
            <span>{{ currentGameState.attempts }}/{{ VERBS_PER_GAME }}</span>
          </div>
        </div>

        <div class="controls">
          <label>
            Niveau
            <select v-model="currentLevel" @change="onLevelChange">
              <option v-for="level in levelList" :key="level" :value="level">{{ level }}</option>
            </select>
          </label>
          <label>
            Mode
            <select v-model="currentMode" @change="loadQuestion">
              <option v-for="[key, mode] in modeList" :key="key" :value="key">{{ mode.label }}</option>
            </select>
          </label>
          <label class="sound-toggle">
            Son montre
            <input v-model="soundEnabled" type="checkbox" />
          </label>
          <button @click="loadQuestion" :disabled="loading">Nouvelle question</button>
        </div>
      </section>

      <section class="card quiz" v-if="currentQuestion">
        <div class="quiz-main-card">
          <p class="quiz-badge">Défi en cours</p>
          <h2 v-html="currentQuestion.promptHtml ?? currentQuestion.prompt"></h2>
        </div>

        <p v-if="timeLeft !== null" class="timer-inline">Temps restant: {{ timeLeft }}s</p>

        <div class="answer-panel">
          <label class="answer-label" for="answer-input">Ta réponse</label>
          <p v-if="answerPersonPrompt" class="answer-person-prefix">{{ answerPersonPrompt }}</p>
          <div class="answer-row">
            <input
              id="answer-input"
              class="answer-input"
              ref="answerInput"
              v-model="answer"
              type="text"
              :placeholder="answerPlaceholder"
              autocomplete="off"
              autocapitalize="none"
              autocorrect="off"
              enterkeyhint="done"
              @keyup.enter="onEnterInAnswerField"
            />
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
        </div>

        <p v-if="feedback" :class="feedback.correct ? 'ok' : 'ko'">
          <template v-if="feedback.correct">Bravo, c'est correct.</template>
          <template v-else>Incorrect. Réponse attendue : {{ feedback.expected }}</template>
          <template v-if="feedback.chapterCompleted"> Partie validée: {{ feedback.chapterCompleted }}.</template>
          <template v-if="feedback.nextChapterTitle"> Partie suivante: {{ feedback.nextChapterTitle }}.</template>
          <template v-if="feedback.promotedTo"> Niveau suivant débloqué: {{ feedback.promotedTo }}</template>
        </p>
        <p v-if="feedback" class="next-hint">Appuie sur Entrée pour la question suivante.</p>
        <p v-if="errorMessage" class="ko">{{ errorMessage }}</p>
      </section>

      <section class="card stats">
        <h3>Score global</h3>
        <p>{{ score.correct }} / {{ score.total }} - {{ score.rate }}%</p>
      </section>
    </div>
  </main>
</template>
