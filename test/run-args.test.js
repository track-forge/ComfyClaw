const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getUploadContentType,
  parseFileArg,
  parseRunArgs,
  prepareUploadFile,
  uploadResponseToInputValue,
} = require('../run-args');
const {
  applyNodeInputOverrides,
  pruneOptionalBflImageInputs,
  randomizeSeeds,
  resolveTagOverrides,
} = require('../patch');

describe('parseRunArgs', () => {
  it('parses outDir, repeated --set, and repeated --file', () => {
    const result = parseRunArgs([
      'outputs',
      '--set', '@prompt.text=a=b',
      '--file', '@image.image=/tmp/in.png',
      '--file', '12.audio=/tmp/in.flac',
    ], { baseDir: '/repo' });

    assert.deepStrictEqual(result, {
      outDir: 'outputs',
      setArgs: ['@prompt.text=a=b'],
      fileArgs: ['@image.image=/tmp/in.png', '12.audio=/tmp/in.flac'],
    });
  });

  it('uses the default outputs directory', () => {
    assert.deepStrictEqual(parseRunArgs([], { baseDir: '/repo' }), {
      outDir: path.join('/repo', 'outputs'),
      setArgs: [],
      fileArgs: [],
    });
  });

  it('rejects unknown flags and extra positional arguments', () => {
    assert.throws(() => parseRunArgs(['--bad'], { baseDir: '/repo' }), /Unknown --run option/);
    assert.throws(() => parseRunArgs(['out', 'extra'], { baseDir: '/repo' }), /Unexpected positional/);
  });
});

describe('parseFileArg', () => {
  it('keeps paths that contain equals signs', () => {
    assert.deepStrictEqual(parseFileArg('@image.image=/tmp/a=b.png'), {
      left: '@image.image',
      localPath: '/tmp/a=b.png',
    });
  });

  it('rejects malformed upload args', () => {
    assert.throws(() => parseFileArg('@image.image'), /Invalid --file/);
    assert.throws(() => parseFileArg('@image=/tmp/a.png'), /Invalid --file/);
  });
});

describe('upload validation', () => {
  it('allows image and audio extensions with explicit content types', () => {
    assert.equal(getUploadContentType('x.PNG'), 'image/png');
    assert.equal(getUploadContentType('x.flac'), 'audio/flac');
    assert.equal(getUploadContentType('x.mp3'), 'audio/mpeg');
    assert.equal(getUploadContentType('x.opus'), 'audio/opus');
  });

  it('rejects unsupported extensions before upload', () => {
    assert.throws(() => getUploadContentType('x.txt'), /Unsupported --file extension/);
  });

  it('prepares existing local upload files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comfyclaw-upload-'));
    const file = path.join(dir, 'sample.wav');
    fs.writeFileSync(file, 'data');

    assert.deepStrictEqual(prepareUploadFile(`12.audio=${file}`), {
      left: '12.audio',
      localPath: file,
      basename: 'sample.wav',
      contentType: 'audio/wav',
    });
  });

  it('uses ComfyUI response subfolder when present', () => {
    assert.equal(uploadResponseToInputValue({ name: 'renamed.png' }), 'renamed.png');
    assert.equal(uploadResponseToInputValue({ name: 'renamed.png', subfolder: 'batch' }), 'batch/renamed.png');
  });
});


describe('uploaded file override flow', () => {
  it('resolves uploaded filenames through tags with mixed --set values', () => {
    const prompt = {
      '10': { class_type: 'LoadImage', inputs: { image: '' }, _meta: { title: '@image' } },
      '20': { class_type: 'KSampler', inputs: { seed: 1, steps: 20 }, _meta: { title: '@ksampler' } },
    };
    const setArgs = [
      '@ksampler.seed=1234',
      `@image.image=${uploadResponseToInputValue({ name: 'uploaded.png' })}`,
    ];

    const overrides = resolveTagOverrides(prompt, setArgs);
    const { applied } = applyNodeInputOverrides(prompt, overrides);
    const randomized = randomizeSeeds(prompt, applied);

    assert.equal(prompt['10'].inputs.image, 'uploaded.png');
    assert.equal(prompt['20'].inputs.seed, 1234);
    assert.deepStrictEqual(randomized, []);
  });

  it('lets uploaded LoadImage values prevent optional BFL pruning', () => {
    const prompt = {
      '100': { class_type: 'LoadImage', inputs: { image: '' }, _meta: { title: '@image' } },
      '101': { class_type: 'ImageToBase64_BFL', inputs: { image: ['100', 0] } },
      '200': { class_type: 'FluxKontextPro_BFL', inputs: { input_image_2: ['101', 0] } },
    };

    const overrides = resolveTagOverrides(prompt, ['@image.image=uploaded.png']);
    applyNodeInputOverrides(prompt, overrides);
    const { removedNodeIds, disconnectedInputs } = pruneOptionalBflImageInputs(prompt);

    assert.ok(prompt['100']);
    assert.ok(prompt['101']);
    assert.deepStrictEqual(removedNodeIds, []);
    assert.deepStrictEqual(disconnectedInputs, []);
  });

  it('supports direct node-ID audio upload injection', () => {
    const prompt = {
      '12': { class_type: 'LoadAudio', inputs: { audio: '' } },
    };

    const overrides = resolveTagOverrides(prompt, ['12.audio=uploaded.flac']);
    applyNodeInputOverrides(prompt, overrides);

    assert.equal(prompt['12'].inputs.audio, 'uploaded.flac');
  });
});
