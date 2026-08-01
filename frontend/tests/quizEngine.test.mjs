import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestion, checkAnswer, computeProgression } from '../src/services/quizEngine.js';

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
