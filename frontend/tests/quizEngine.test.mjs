import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion, checkAnswer, computeProgression } from '../src/services/quizEngine.js';
import { normalizeText } from '../src/services/normalize.js';

function findQuestionByCriteria({ level = 'C1', poolDefinitions, allowedLemmas, match }) {
  for (let index = 0; index < 8000; index += 1) {
    const candidate = createQuestion(level, 'trouver_conjugaison', {
      poolDefinitions,
      allowedLemmas
    });

    if (!candidate) {
      return null;
    }

    if (match(candidate)) {
      return candidate;
    }

    checkAnswer(candidate.questionId, '__discard__');
  }

  return null;
}

test('createQuestion returns a valid question and accepts the correct answer', () => {
  const question = createQuestion('A1', 'trouver_conjugaison', { random: () => 0 });
  assert.ok(question);
  assert.equal(question.level, 'A1');
  const result = checkAnswer(question.questionId, question.expected);
  assert.equal(result.correct, true);
});

test('computeProgression promotes when the success rate is high enough', () => {
  const progression = computeProgression('A1', [true, true, true, true, true, true, true, true, true, true, true, true]);
  assert.equal(progression.promoted, true);
  assert.equal(progression.nextLevel, 'A2');
});

test('normalizeText matches a straightforward mobile-style answer', () => {
  assert.equal(normalizeText('parles'), normalizeText('parles'));
  assert.equal(normalizeText(' Parles '), normalizeText('parles'));
});

test('compound tense accepts the auxiliary plus participle', () => {
  let question = null;

  for (let index = 0; index < 5000; index += 1) {
    const candidate = createQuestion('B1', 'trouver_conjugaison');
    if (candidate.lemma === 'finir' && candidate.person === 'je' && candidate.tense === 'Passé composé') {
      question = candidate;
      break;
    }

    checkAnswer(candidate.questionId, '__discard__');
  }

  assert.ok(question);
  assert.equal(question.expected, 'ai fini');

  const result = checkAnswer(question.questionId, 'ai fini');
  assert.equal(result.correct, true);
});

test('impersonal verb falloir does not generate imperative questions', () => {
  const question = createQuestion('B1', 'trouver_conjugaison', {
    poolDefinitions: [{ mood: 'impératif', tense: 'présent' }],
    allowedLemmas: ['falloir']
  });

  assert.equal(question, null);
});

test('pronominal passé composé requires reflexive pronoun (se souvenir, je)', () => {
  const question = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'indicatif', tense: 'passé composé' }],
    allowedLemmas: ['souvenir'],
    match: (candidate) => candidate.lemma === 'souvenir' && candidate.person === 'je' && candidate.tense === 'Passé composé'
  });

  assert.ok(question);
  assert.match(question.expected, /^(me\s|m')/i);

  const correctResult = checkAnswer(question.questionId, question.expected);
  assert.equal(correctResult.correct, true);

  const retry = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'indicatif', tense: 'passé composé' }],
    allowedLemmas: ['souvenir'],
    match: (candidate) => candidate.lemma === 'souvenir' && candidate.person === 'je' && candidate.tense === 'Passé composé'
  });

  assert.ok(retry);
  const missingPronounResult = checkAnswer(retry.questionId, 'suis souvenu');
  assert.equal(missingPronounResult.correct, false);
});

test('pronominal futur simple requires pronoun (se doucher, nous)', () => {
  const question = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'indicatif', tense: 'futur simple' }],
    allowedLemmas: ['doucher'],
    match: (candidate) => candidate.lemma === 'doucher' && candidate.person === 'nous' && candidate.tense === 'Futur simple'
  });

  assert.ok(question);
  assert.equal(question.expected, 'nous doucherons');

  const valid = checkAnswer(question.questionId, 'nous doucherons');
  assert.equal(valid.correct, true);

  const retry = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'indicatif', tense: 'futur simple' }],
    allowedLemmas: ['doucher'],
    match: (candidate) => candidate.lemma === 'doucher' && candidate.person === 'nous' && candidate.tense === 'Futur simple'
  });

  assert.ok(retry);
  const invalid = checkAnswer(retry.questionId, 'doucherons');
  assert.equal(invalid.correct, false);
});

test('pronominal subjonctif passé accepts agreement variants with pronoun (se réveiller, ils/elles)', () => {
  const masculine = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'subjonctif', tense: 'passé' }],
    allowedLemmas: ['réveiller'],
    match: (candidate) => candidate.lemma === 'réveiller' && candidate.person === 'ils/elles' && candidate.tense === 'Passé'
  });

  assert.ok(masculine);
  const masculineResult = checkAnswer(masculine.questionId, 'se soient réveillés');
  assert.equal(masculineResult.correct, true);

  const feminine = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'subjonctif', tense: 'passé' }],
    allowedLemmas: ['réveiller'],
    match: (candidate) => candidate.lemma === 'réveiller' && candidate.person === 'ils/elles' && candidate.tense === 'Passé'
  });

  assert.ok(feminine);
  const feminineResult = checkAnswer(feminine.questionId, 'se soient réveillées');
  assert.equal(feminineResult.correct, true);

  const retry = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'subjonctif', tense: 'passé' }],
    allowedLemmas: ['réveiller'],
    match: (candidate) => candidate.lemma === 'réveiller' && candidate.person === 'ils/elles' && candidate.tense === 'Passé'
  });

  assert.ok(retry);
  const noPronounResult = checkAnswer(retry.questionId, 'soient réveillés');
  assert.equal(noPronounResult.correct, false);
});

test('question prompt displays pronominal infinitive clearly', () => {
  const question = findQuestionByCriteria({
    poolDefinitions: [{ mood: 'indicatif', tense: 'futur simple' }],
    allowedLemmas: ['doucher'],
    match: (candidate) => candidate.lemma === 'doucher' && candidate.person === 'nous' && candidate.tense === 'Futur simple'
  });

  assert.ok(question);
  assert.match(question.prompt, /SE DOUCHER/i);
  assert.equal(question.displayLemma, 'se doucher');
});

test('question prompt keeps non-pronominal infinitive without se', () => {
  const question = findQuestionByCriteria({
    level: 'B1',
    poolDefinitions: [{ mood: 'indicatif', tense: 'présent' }],
    allowedLemmas: ['finir'],
    match: (candidate) => candidate.lemma === 'finir' && candidate.person === 'nous' && candidate.tense === 'Présent'
  });

  assert.ok(question);
  assert.doesNotMatch(question.prompt, /\bSE\s+FINIR\b/i);
  assert.equal(question.displayLemma, 'finir');
});

test('revenir is classified as group3 from Excel reference', () => {
  const wrongGroupQuestion = createQuestion('B1', 'trouver_conjugaison', {
    allowedLemmas: ['revenir'],
    verbGroups: ['group2']
  });

  assert.equal(wrongGroupQuestion, null);

  const rightGroupQuestion = createQuestion('B1', 'trouver_conjugaison', {
    allowedLemmas: ['revenir'],
    verbGroups: ['group3']
  });

  assert.ok(rightGroupQuestion);
  assert.equal(rightGroupQuestion.lemma, 'revenir');
});
