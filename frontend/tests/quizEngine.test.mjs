import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion, checkAnswer, computeProgression } from '../src/services/quizEngine.js';
import { normalizeText } from '../src/services/normalize.js';

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
