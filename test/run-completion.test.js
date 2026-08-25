const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createRunCompletionGate } = require('../cli');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeGate() {
  let cleanupCount = 0;
  let resolved = false;
  let gate;
  const done = new Promise((resolve, reject) => {
    gate = createRunCompletionGate({
      resolve: () => {
        resolved = true;
        resolve();
      },
      reject,
      cleanup: () => {
        cleanupCount += 1;
      },
    });
  });

  return {
    gate,
    done,
    get cleanupCount() {
      return cleanupCount;
    },
    get resolved() {
      return resolved;
    },
  };
}

describe('createRunCompletionGate', () => {
  it('waits for delayed multi-file save work after execution_success', async () => {
    const firstDownload = deferred();
    const secondDownload = deferred();
    const saved = [];
    const state = makeGate();

    state.gate.addTask((async () => {
      saved.push(await firstDownload.promise);
      saved.push(await secondDownload.promise);
    })());

    state.gate.markExecutionSuccess();
    await tick();
    assert.equal(state.resolved, false);
    assert.equal(state.gate.pendingCount(), 1);

    firstDownload.resolve('one.flac');
    await tick();
    assert.equal(state.resolved, false);
    assert.deepStrictEqual(saved, ['one.flac']);

    secondDownload.resolve('two.flac');
    await state.done;
    assert.equal(state.resolved, true);
    assert.deepStrictEqual(saved, ['one.flac', 'two.flac']);
    assert.equal(state.cleanupCount, 1);
  });

  it('rejects when delayed save work fails after execution_success', async () => {
    const viewFailure = deferred();
    const state = makeGate();

    state.gate.addTask((async () => {
      await viewFailure.promise;
      throw new Error('Failed to fetch file: 500 Internal Server Error');
    })());

    state.gate.markExecutionSuccess();
    await tick();
    assert.equal(state.resolved, false);

    viewFailure.resolve();
    await assert.rejects(state.done, /Failed to fetch file: 500 Internal Server Error/);
    assert.equal(state.cleanupCount, 1);
  });

  it('waits for multiple save-node callbacks and batches before resolving', async () => {
    const firstBatch = deferred();
    const secondBatch = deferred();
    const saved = [];
    const state = makeGate();

    state.gate.addTask((async () => {
      saved.push(...await firstBatch.promise);
    })());
    state.gate.addTask((async () => {
      saved.push(...await secondBatch.promise);
    })());

    state.gate.markExecutionSuccess();
    await tick();
    assert.equal(state.resolved, false);
    assert.equal(state.gate.pendingCount(), 2);

    secondBatch.resolve(['node-2-a.mp3', 'node-2-b.mp3']);
    await tick();
    assert.equal(state.resolved, false);
    assert.deepStrictEqual(saved, ['node-2-a.mp3', 'node-2-b.mp3']);

    firstBatch.resolve(['node-1-a.flac', 'node-1-b.flac']);
    await state.done;
    assert.equal(state.resolved, true);
    assert.deepStrictEqual(saved, ['node-2-a.mp3', 'node-2-b.mp3', 'node-1-a.flac', 'node-1-b.flac']);
    assert.equal(state.cleanupCount, 1);
  });
});
