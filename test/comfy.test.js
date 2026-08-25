const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ComfyUI = require('../comfy');

function makeUploadClient() {
  const client = Object.create(ComfyUI.prototype);
  client.comfyUIServerURL = 'http://comfy.test';
  return client;
}

afterEach(() => {
  global.fetch = undefined;
});

describe('ComfyUI uploadFile', () => {
  it('posts file bytes to ComfyUI /upload/image with collision-safe defaults', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comfyclaw-comfy-'));
    const localPath = path.join(dir, 'input.flac');
    fs.writeFileSync(localPath, 'audio');

    let request;
    global.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ name: 'input_00001.flac', subfolder: '', type: 'input' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await makeUploadClient().uploadFile({
      localPath,
      basename: 'input.flac',
      contentType: 'audio/flac',
    });

    assert.deepStrictEqual(result, { name: 'input_00001.flac', subfolder: '', type: 'input' });
    assert.equal(request.url, 'http://comfy.test/upload/image');
    assert.equal(request.options.method, 'POST');
    assert.ok(request.options.body instanceof FormData);
    assert.equal(request.options.body.get('type'), 'input');
    assert.equal(request.options.body.get('overwrite'), 'false');
    assert.equal(request.options.body.get('image').name, 'input.flac');
    assert.equal(request.options.body.get('image').type, 'audio/flac');
  });

  it('surfaces upload failures with status and body', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comfyclaw-comfy-'));
    const localPath = path.join(dir, 'input.png');
    fs.writeFileSync(localPath, 'image');

    global.fetch = async () => new Response('{"error":"bad upload"}', { status: 400 });

    await assert.rejects(
      makeUploadClient().uploadFile({ localPath, basename: 'input.png', contentType: 'image/png' }),
      /HTTP 400.*bad upload/,
    );
  });
});
