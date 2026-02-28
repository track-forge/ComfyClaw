const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'workflow-audit.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function runAudit(dir) {
  return execFileSync(process.execPath, [SCRIPT, dir], {
    encoding: 'utf8',
    timeout: 10000,
  });
}

function runAuditSafe(dir) {
  try {
    const stdout = runAudit(dir);
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

describe('workflow-audit.js', () => {
  it('passes on valid workflow', () => {
    // Create a temp dir with only the valid workflow
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-valid');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.copyFileSync(path.join(FIXTURES, 'valid-workflow-api.json'), path.join(tmp, 'valid-workflow-api.json'));
      const { exitCode, stdout } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 0, `Expected exit 0, got ${exitCode}. Output: ${stdout}`);
      assert.ok(stdout.includes('✅') || stdout.includes('All checks passed'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails on workflow missing @save tag', () => {
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-nosave');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.copyFileSync(path.join(FIXTURES, 'missing-save-tag-api.json'), path.join(tmp, 'missing-save-tag-api.json'));
      const { exitCode, stdout } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 1, 'Should exit 1 for missing @save');
      assert.ok(stdout.includes('Missing required tag "@save"'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports duplicate tags', () => {
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-dupe');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.copyFileSync(path.join(FIXTURES, 'duplicate-tags-api.json'), path.join(tmp, 'duplicate-tags-api.json'));
      const { exitCode, stdout } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 1, 'Should exit 1 for duplicate tags');
      assert.ok(stdout.includes('Duplicate tag'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports broken node references', () => {
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-brokenref');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.copyFileSync(path.join(FIXTURES, 'broken-ref-api.json'), path.join(tmp, 'broken-ref-api.json'));
      const { exitCode, stdout } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 1, 'Should exit 1 for broken refs');
      assert.ok(stdout.includes('non-existent node'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports empty workflows', () => {
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-empty');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.copyFileSync(path.join(FIXTURES, 'empty-workflow-api.json'), path.join(tmp, 'empty-workflow-api.json'));
      const { exitCode, stdout } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 1, 'Should exit 1 for empty workflow');
      assert.ok(stdout.includes('Empty workflow'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports invalid JSON', () => {
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-badjson');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.copyFileSync(path.join(FIXTURES, 'invalid-json-api.json'), path.join(tmp, 'invalid-json-api.json'));
      const { exitCode, stdout } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 1, 'Should exit 1 for invalid JSON');
      assert.ok(stdout.includes('Failed to parse JSON'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('exits 0 when no workflow files found', () => {
    const fs = require('node:fs');
    const tmp = path.join(__dirname, 'tmp-audit-nofiles');
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const { exitCode } = runAuditSafe(tmp);
      assert.strictEqual(exitCode, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('exits 2 for non-existent directory', () => {
    const { exitCode } = runAuditSafe('/tmp/nonexistent-dir-xyz-' + Date.now());
    assert.strictEqual(exitCode, 2);
  });
});
