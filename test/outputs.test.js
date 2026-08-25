const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { collectOutputDescriptors, makeSafeLocalOutputPath } = require('../outputs');

describe('collectOutputDescriptors', () => {
  it('collects image, gif, and audio descriptors in stable order', () => {
    const result = collectOutputDescriptors({
      audio: [
        { filename: 'sound.flac', subfolder: '', type: 'output' },
        { filename: 'sound.mp3', subfolder: '', type: 'output' },
        { filename: 'sound.opus', subfolder: '', type: 'output' },
      ],
      images: [{ filename: 'image.png', subfolder: '', type: 'output' }],
      gifs: [{ filename: 'clip.gif', subfolder: 'gifs', type: 'output' }],
    });

    assert.deepStrictEqual(result.map((d) => [d.outputKey, d.filename]), [
      ['images', 'image.png'],
      ['gifs', 'clip.gif'],
      ['audio', 'sound.flac'],
      ['audio', 'sound.mp3'],
      ['audio', 'sound.opus'],
    ]);
  });

  it('returns empty arrays for missing output', () => {
    assert.deepStrictEqual(collectOutputDescriptors(undefined), []);
    assert.deepStrictEqual(collectOutputDescriptors({}), []);
  });

  it('defaults missing subfolder to an empty string', () => {
    const [descriptor] = collectOutputDescriptors({
      audio: [{ filename: 'sound.flac', type: 'output' }],
    });
    assert.equal(descriptor.subfolder, '');
  });

  it('rejects malformed output keys and descriptors', () => {
    assert.throws(() => collectOutputDescriptors({ audio: {} }), /audio must be an array/);
    assert.throws(() => collectOutputDescriptors({ audio: [null] }), /must be an object/);
    assert.throws(() => collectOutputDescriptors({ audio: [{ subfolder: '', type: 'output' }] }), /filename/);
    assert.throws(() => collectOutputDescriptors({ audio: [{ filename: 'x.flac', subfolder: '', type: '' }] }), /type/);
  });
});

describe('makeSafeLocalOutputPath', () => {
  it('preserves the existing promptId-basename convention', () => {
    const result = makeSafeLocalOutputPath('/tmp/out', 'abc', {
      filename: 'ComfyUI_00001_.png',
    });
    assert.equal(result, path.resolve('/tmp/out/abc-ComfyUI_00001_.png'));
  });

  it('strips path components from descriptors', () => {
    const result = makeSafeLocalOutputPath('/tmp/out', 'abc', {
      filename: '../nested/evil.png',
    });
    assert.equal(result, path.resolve('/tmp/out/abc-evil.png'));
  });

  it('strips Windows path components from descriptors', () => {
    const result = makeSafeLocalOutputPath('/tmp/out', 'abc', {
      filename: '..\\nested\\evil.png',
    });
    assert.equal(result, path.resolve('/tmp/out/abc-evil.png'));
  });

  it('adds deterministic suffixes for filename collisions', () => {
    const seen = new Map();
    const first = makeSafeLocalOutputPath('/tmp/out', 'abc', { filename: 'same.flac' }, seen);
    const second = makeSafeLocalOutputPath('/tmp/out', 'abc', { filename: 'same.flac' }, seen);
    const third = makeSafeLocalOutputPath('/tmp/out', 'abc', { filename: 'same.flac' }, seen);

    assert.equal(first, path.resolve('/tmp/out/abc-same.flac'));
    assert.equal(second, path.resolve('/tmp/out/abc-same-2.flac'));
    assert.equal(third, path.resolve('/tmp/out/abc-same-3.flac'));
  });
});
