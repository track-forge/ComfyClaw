const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  coerceValue,
  parseSetArgs,
  resolveTagOverrides,
  applyNodeInputOverrides,
  randomizeSeeds,
  pruneOptionalBflImageInputs,
} = require('../patch');

// ---------------------------------------------------------------------------
// coerceValue
// ---------------------------------------------------------------------------
describe('coerceValue', () => {
  it('converts "true" to boolean true', () => {
    assert.strictEqual(coerceValue('true'), true);
  });

  it('converts "false" to boolean false', () => {
    assert.strictEqual(coerceValue('false'), false);
  });

  it('converts "null" to null', () => {
    assert.strictEqual(coerceValue('null'), null);
  });

  it('converts "undefined" to undefined', () => {
    assert.strictEqual(coerceValue('undefined'), undefined);
  });

  it('converts integer strings', () => {
    assert.strictEqual(coerceValue('42'), 42);
    assert.strictEqual(coerceValue('-7'), -7);
    assert.strictEqual(coerceValue('0'), 0);
  });

  it('converts float strings', () => {
    assert.strictEqual(coerceValue('3.14'), 3.14);
    assert.strictEqual(coerceValue('-0.5'), -0.5);
  });

  it('parses JSON arrays', () => {
    assert.deepStrictEqual(coerceValue('[1,2,3]'), [1, 2, 3]);
  });

  it('parses JSON objects', () => {
    assert.deepStrictEqual(coerceValue('{"a":1}'), { a: 1 });
  });

  it('returns invalid JSON objects/arrays as strings', () => {
    assert.strictEqual(coerceValue('{bad json}'), '{bad json}');
    assert.strictEqual(coerceValue('[oops'), '[oops');
  });

  it('returns plain strings as-is', () => {
    assert.strictEqual(coerceValue('hello world'), 'hello world');
    assert.strictEqual(coerceValue(''), '');
  });

  it('does not coerce strings that look like floats but have no decimal part', () => {
    // "123." should stay string (regex requires digits after dot)
    assert.strictEqual(coerceValue('123.'), '123.');
  });
});

// ---------------------------------------------------------------------------
// parseSetArgs
// ---------------------------------------------------------------------------
describe('parseSetArgs', () => {
  it('parses simple key=value pairs', () => {
    const result = parseSetArgs(['6.text=hello', '3.steps=30']);
    assert.deepStrictEqual(result, {
      '6': { text: 'hello' },
      '3': { steps: 30 },
    });
  });

  it('handles multiple keys on the same node', () => {
    const result = parseSetArgs(['3.seed=42', '3.steps=20']);
    assert.deepStrictEqual(result, {
      '3': { seed: 42, steps: 20 },
    });
  });

  it('handles values containing equals signs', () => {
    const result = parseSetArgs(['6.text=a=b=c']);
    assert.deepStrictEqual(result, { '6': { text: 'a=b=c' } });
  });

  it('returns empty object for empty/null input', () => {
    assert.deepStrictEqual(parseSetArgs([]), {});
    assert.deepStrictEqual(parseSetArgs(null), {});
    assert.deepStrictEqual(parseSetArgs(undefined), {});
  });

  it('throws on missing equals sign', () => {
    assert.throws(() => parseSetArgs(['bad']), /Invalid --set/);
  });

  it('throws on missing dot separator', () => {
    assert.throws(() => parseSetArgs(['nodeid=value']), /Invalid --set/);
  });

  it('coerces values through coerceValue', () => {
    const result = parseSetArgs(['1.flag=true', '1.count=5']);
    assert.strictEqual(result['1'].flag, true);
    assert.strictEqual(result['1'].count, 5);
  });
});

// ---------------------------------------------------------------------------
// resolveTagOverrides
// ---------------------------------------------------------------------------
describe('resolveTagOverrides', () => {
  const prompt = {
    '6': { inputs: { text: 'old' }, class_type: 'CLIPTextEncode', _meta: { title: '@prompt' } },
    '7': { inputs: { text: 'bad' }, class_type: 'CLIPTextEncode', _meta: { title: '@negative' } },
    '3': { inputs: { seed: 1 }, class_type: 'KSampler', _meta: { title: '@ksampler' } },
  };

  it('resolves @tag to node ID', () => {
    const result = resolveTagOverrides(prompt, ['@prompt.text=hello']);
    assert.deepStrictEqual(result, { '6': { text: 'hello' } });
  });

  it('passes through numeric node IDs', () => {
    const result = resolveTagOverrides(prompt, ['3.seed=99']);
    assert.deepStrictEqual(result, { '3': { seed: 99 } });
  });

  it('mixes tags and node IDs', () => {
    const result = resolveTagOverrides(prompt, ['@prompt.text=hi', '3.seed=99']);
    assert.deepStrictEqual(result, { '6': { text: 'hi' }, '3': { seed: 99 } });
  });

  it('maps @prompt.text to value when tagged node uses value', () => {
    const promptValueNode = {
      '6': { inputs: { value: 'old' }, _meta: { title: '@prompt' } },
    };

    const result = resolveTagOverrides(promptValueNode, ['@prompt.text=hello']);
    assert.deepStrictEqual(result, { '6': { value: 'hello' } });
  });

  it('maps @prompt.value to text when tagged node uses text', () => {
    const promptTextNode = {
      '6': { inputs: { text: 'old' }, _meta: { title: '@prompt' } },
    };

    const result = resolveTagOverrides(promptTextNode, ['@prompt.value=hello']);
    assert.deepStrictEqual(result, { '6': { text: 'hello' } });
  });

  it('maps @negative.text to value when tagged node uses value', () => {
    const negativeValueNode = {
      '7': { inputs: { value: 'none' }, _meta: { title: '@negative' } },
    };

    const result = resolveTagOverrides(negativeValueNode, ['@negative.text=blurry']);
    assert.deepStrictEqual(result, { '7': { value: 'blurry' } });
  });

  it('throws when tag not found', () => {
    assert.throws(() => resolveTagOverrides(prompt, ['@missing.key=val']), /not found in workflow/);
  });

  it('throws when tag is ambiguous (duplicates)', () => {
    const dupePrompt = {
      '1': { _meta: { title: '@prompt' } },
      '2': { _meta: { title: '@prompt' } },
    };
    assert.throws(() => resolveTagOverrides(dupePrompt, ['@prompt.text=x']), /ambiguous/);
  });

  it('returns empty object for empty input', () => {
    assert.deepStrictEqual(resolveTagOverrides(prompt, []), {});
    assert.deepStrictEqual(resolveTagOverrides(prompt, null), {});
  });

  it('throws on missing equals', () => {
    assert.throws(() => resolveTagOverrides(prompt, ['@prompt']), /Invalid --set/);
  });

  it('throws on missing dot', () => {
    assert.throws(() => resolveTagOverrides(prompt, ['@prompt=val']), /Invalid --set/);
  });
});

// ---------------------------------------------------------------------------
// applyNodeInputOverrides
// ---------------------------------------------------------------------------
describe('applyNodeInputOverrides', () => {
  it('applies overrides to existing nodes', () => {
    const prompt = { '6': { inputs: { text: 'old' } } };
    const { apiPrompt, applied, skipped } = applyNodeInputOverrides(prompt, { '6': { text: 'new' } });
    assert.strictEqual(apiPrompt['6'].inputs.text, 'new');
    assert.strictEqual(applied.length, 1);
    assert.strictEqual(skipped.length, 0);
  });

  it('skips non-existent nodes', () => {
    const prompt = { '1': { inputs: {} } };
    const { skipped } = applyNodeInputOverrides(prompt, { '99': { text: 'x' } });
    assert.strictEqual(skipped.length, 1);
    assert.strictEqual(skipped[0].reason, 'node_not_found');
  });

  it('refuses to override linked inputs (arrays)', () => {
    const prompt = { '3': { inputs: { model: ['4', 0], seed: 1 } } };
    const { applied, skipped } = applyNodeInputOverrides(prompt, { '3': { model: 'hack', seed: 99 } });
    assert.strictEqual(prompt['3'].inputs.model[0], '4'); // unchanged
    assert.strictEqual(prompt['3'].inputs.seed, 99);
    assert.ok(skipped.some(s => s.reason === 'linked_input_refuse_override'));
    assert.strictEqual(applied.length, 1);
  });

  it('creates inputs object if missing', () => {
    const prompt = { '1': { class_type: 'Foo' } };
    const { apiPrompt } = applyNodeInputOverrides(prompt, { '1': { key: 'val' } });
    assert.strictEqual(apiPrompt['1'].inputs.key, 'val');
  });

  it('returns unchanged prompt when overrides is null/undefined', () => {
    const prompt = { '1': { inputs: { a: 1 } } };
    const { apiPrompt } = applyNodeInputOverrides(prompt, null);
    assert.strictEqual(apiPrompt['1'].inputs.a, 1);
  });

  it('handles empty overrides object', () => {
    const prompt = { '1': { inputs: { a: 1 } } };
    const { applied, skipped } = applyNodeInputOverrides(prompt, {});
    assert.strictEqual(applied.length, 0);
    assert.strictEqual(skipped.length, 0);
  });
});

// ---------------------------------------------------------------------------
// randomizeSeeds
// ---------------------------------------------------------------------------
describe('randomizeSeeds', () => {
  it('randomizes both seed and noise_seed keys', () => {
    const prompt = {
      '1': { inputs: { seed: 123 }, class_type: 'KSampler' },
      '2': { inputs: { noise_seed: 456 }, class_type: 'RandomNoise' },
      '3': { inputs: { steps: 20 }, class_type: 'Scheduler' },
    };

    const randomized = randomizeSeeds(prompt, []);

    assert.equal(randomized.length, 2);
    assert.ok(randomized.some((r) => r.nodeId === '1' && r.key === 'seed'));
    assert.ok(randomized.some((r) => r.nodeId === '2' && r.key === 'noise_seed'));
    assert.notEqual(prompt['1'].inputs.seed, 123);
    assert.notEqual(prompt['2'].inputs.noise_seed, 456);
    assert.equal(typeof prompt['1'].inputs.seed, 'number');
    assert.equal(typeof prompt['2'].inputs.noise_seed, 'number');
  });

  it('skips seed keys that were explicitly overridden', () => {
    const prompt = {
      '1': { inputs: { seed: 111 } },
      '2': { inputs: { noise_seed: 222 } },
    };

    const appliedOverrides = [
      { nodeId: '1', key: 'seed', value: 999 },
      { nodeId: '2', key: 'noise_seed', value: 888 },
    ];

    const randomized = randomizeSeeds(prompt, appliedOverrides);
    assert.equal(randomized.length, 0);
    assert.equal(prompt['1'].inputs.seed, 111);
    assert.equal(prompt['2'].inputs.noise_seed, 222);
  });
});

// ---------------------------------------------------------------------------
// pruneOptionalBflImageInputs
// ---------------------------------------------------------------------------
describe('pruneOptionalBflImageInputs', () => {
  it('removes ImageToBase64_BFL node and consumer link when source LoadImage is empty', () => {
    const prompt = {
      '100': { class_type: 'LoadImage', inputs: { image: '' } },
      '101': { class_type: 'ImageToBase64_BFL', inputs: { image: ['100', 0], output_format: 'jpeg' } },
      '200': { class_type: 'FluxKontextPro_BFL', inputs: { input_image_2: ['101', 0], prompt: 'x' } },
    };

    const { apiPrompt, removedNodeIds, disconnectedInputs } = pruneOptionalBflImageInputs(prompt);

    assert.equal(apiPrompt['101'], undefined);
    assert.equal(apiPrompt['100'], undefined);
    assert.equal(apiPrompt['200'].inputs.input_image_2, undefined);
    assert.ok(removedNodeIds.includes('101'));
    assert.ok(removedNodeIds.includes('100'));
    assert.deepStrictEqual(disconnectedInputs, [{
      nodeId: '200',
      key: 'input_image_2',
      fromNodeId: '101',
    }]);
  });

  it('keeps BFL chain when LoadImage has a filename', () => {
    const prompt = {
      '100': { class_type: 'LoadImage', inputs: { image: 'face.png' } },
      '101': { class_type: 'ImageToBase64_BFL', inputs: { image: ['100', 0], output_format: 'jpeg' } },
      '200': { class_type: 'FluxKontextPro_BFL', inputs: { input_image_2: ['101', 0] } },
    };

    const { apiPrompt, removedNodeIds, disconnectedInputs } = pruneOptionalBflImageInputs(prompt);

    assert.ok(apiPrompt['101']);
    assert.ok(apiPrompt['100']);
    assert.deepStrictEqual(removedNodeIds, []);
    assert.deepStrictEqual(disconnectedInputs, []);
  });
});
