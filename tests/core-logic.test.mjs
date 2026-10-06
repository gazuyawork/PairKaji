import test from 'node:test';
import assert from 'node:assert/strict';

import { burdenLabel, burdenWeight, summarizeWeekBurden } from '../src/lib/burden.ts';
import {
  countUndoneTodos,
  taskHasChecklistIntent,
  taskShowsOnTodoTab,
} from '../src/lib/checklistTask.ts';
import { fuzzyIncludes, normalizeFuzzy } from '../src/lib/fuzzyText.ts';
import {
  isRetiredCategory,
  isShoppingCategory,
  normalizeCategoryForSave,
  parseCategoryForUI,
} from '../src/lib/taskCategory.ts';

test('fuzzy text normalizes width, case, kana, spaces and long vowels', () => {
  assert.equal(normalizeFuzzy(' ＡＢＣ カー ド '), 'abcかど');
  assert.equal(fuzzyIncludes('オカイモノ', 'かいもの'), true);
  assert.equal(fuzzyIncludes('掃除', ''), true);
});

test('retired task categories are normalized to the supported fallback', () => {
  assert.equal(isShoppingCategory('Groceries'), true);
  assert.equal(isRetiredCategory('料理'), true);
  assert.equal(isRetiredCategory('未設定'), false);
  assert.equal(parseCategoryForUI('買い物'), null);
  assert.equal(normalizeCategoryForSave('旅行'), '未設定');
});

test('checklist visibility and remaining count honor explicit flags', () => {
  assert.equal(taskHasChecklistIntent({ isTodo: true }), true);
  assert.equal(taskHasChecklistIntent({ isTodo: false, todos: [{}] }), false);
  assert.equal(taskShowsOnTodoTab({ visible: false, isTodo: true }), false);
  assert.equal(countUndoneTodos([{ done: true }, { done: false }, null]), 2);
});

test('weekly burden ignores private tasks and applies task weights', () => {
  assert.equal(burdenWeight(3), 3);
  assert.equal(burdenWeight('invalid'), 2);
  assert.equal(burdenLabel(1), '小');

  const result = summarizeWeekBurden({
    tasks: [
      { id: 'mine', burden: 1 },
      { id: 'partner', burden: 3 },
      { id: 'private', burden: 3, private: true },
    ],
    completions: [
      { taskId: 'mine', userId: 'me' },
      { taskId: 'partner', userId: 'partner' },
      { taskId: 'private', userId: 'me' },
    ],
    meUid: 'me',
    partnerUid: 'partner',
    start: new Date('2026-10-05T00:00:00+09:00'),
    end: new Date('2026-10-11T23:59:59+09:00'),
  });

  assert.deepEqual(result, {
    me: { load: 1 },
    partner: { load: 3 },
    total: 4,
    meShare: 25,
    partnerShare: 75,
  });
});
