import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NO_DOTENV = '1';
process.env.DECIDE_TIMEOUT_MS = '120000';
const { apply, preset, snapshot } = await import('../src/tunables.mjs');

test('reset restores all live defaults, including values outside the original slider range', () => {
  for (const id of ['famine', 'blight', 'coldsnap', 'forestfire', 'hurricane', 'crunch']) apply(preset(id));
  assert.ok(snapshot().tunables.some(t => t.live && t.moved));
  apply(preset('baseline'));
  assert.deepEqual(snapshot().tunables.filter(t => t.live && t.moved), []);
  const timeout = snapshot().tunables.find(t => t.key === 'DECIDE_TIMEOUT_MS');
  assert.equal(timeout.value, 120000);
  assert.ok(timeout.max >= timeout.value);
});

test('reset leaves settings for the next run unchanged', () => {
  const original = snapshot().tunables.find(t => t.key === 'START_FOOD').value;
  try {
    apply({ START_FOOD: original + 1, FIRE_WOOD: 9 });
    apply(preset('baseline'));
    assert.equal(snapshot().tunables.find(t => t.key === 'START_FOOD').value, original + 1);
    assert.equal(snapshot().tunables.find(t => t.key === 'FIRE_WOOD').moved, false);
  } finally { apply({ START_FOOD: original }); }
});
