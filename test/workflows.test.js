const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// We need to point WORKFLOWS_DIR at our test fixtures.
// workflows.js hardcodes path.join(__dirname, 'workflows'), so we create a
// temporary workflows/ dir with our fixture files and patch the module.

const { listWorkflows, loadWorkflow, WORKFLOWS_DIR } = require('../workflows');

const FIXTURES = path.join(__dirname, 'fixtures');

// We'll create a temp workflows dir inside the project that the module reads
const TEMP_WORKFLOWS = path.join(__dirname, '..', 'workflows-test-tmp');

describe('workflows', () => {
  before(() => {
    fs.mkdirSync(TEMP_WORKFLOWS, { recursive: true });
    // Copy valid fixture as a proper -api.json workflow
    fs.copyFileSync(
      path.join(FIXTURES, 'valid-workflow-api.json'),
      path.join(TEMP_WORKFLOWS, 'testflow-api.json')
    );
  });

  after(() => {
    fs.rmSync(TEMP_WORKFLOWS, { recursive: true, force: true });
  });

  describe('listWorkflows', () => {
    it('returns array of workflows from the workflows/ directory', () => {
      // This tests the real workflows/ dir — it should find the example workflow
      const workflows = listWorkflows();
      assert.ok(Array.isArray(workflows));
      // The repo has text2image-example-api.json
      const names = workflows.map(w => w.name);
      assert.ok(names.includes('text2image-example'), `Expected text2image-example in ${names}`);
    });

    it('each workflow entry has name, filename, and path', () => {
      const workflows = listWorkflows();
      for (const w of workflows) {
        assert.ok(w.name, 'name should be set');
        assert.ok(w.filename.endsWith('-api.json'), 'filename should end with -api.json');
        assert.ok(w.path.includes('workflows'), 'path should contain workflows dir');
      }
    });
  });

  describe('loadWorkflow', () => {
    it('loads a workflow by short name', () => {
      const wf = loadWorkflow('text2image-example');
      assert.ok(wf.prompt);
      assert.ok(typeof wf.prompt === 'object');
      assert.ok(wf.prompt['3'], 'should have node 3 (KSampler)');
    });

    it('throws for non-existent workflow', () => {
      assert.throws(() => loadWorkflow('nonexistent-workflow-xyz'), /not found/);
    });

    it('validates loaded data is an object', () => {
      // Create a workflow that is an array (invalid)
      const badPath = path.join(WORKFLOWS_DIR, 'bad-array-api.json');
      let cleanup = false;
      try {
        fs.writeFileSync(badPath, '[1,2,3]');
        cleanup = true;
        assert.throws(() => loadWorkflow('bad-array'), /not a valid API prompt/);
      } finally {
        if (cleanup) fs.unlinkSync(badPath);
      }
    });

    it('loads by full filename', () => {
      const wf = loadWorkflow('text2image-example-api.json');
      assert.ok(wf.prompt);
    });
  });
});
