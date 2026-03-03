const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  listWorkflows,
  loadWorkflow,
  loadWorkflowMetadata,
  resolveWorkflowMetadataPath,
  WORKFLOWS_DIR,
} = require('../workflows');

describe('workflows', () => {
  describe('listWorkflows', () => {
    it('returns array of workflows from the workflows/ directory', () => {
      const workflows = listWorkflows();
      assert.ok(Array.isArray(workflows));
      assert.ok(workflows.length > 0, 'Expected at least one workflow');
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
      const first = listWorkflows()[0];
      const wf = loadWorkflow(first.name);
      assert.ok(wf.prompt);
      assert.ok(typeof wf.prompt === 'object');
      assert.ok(Object.keys(wf.prompt).length > 0, 'workflow graph should have nodes');
    });

    it('throws for non-existent workflow', () => {
      assert.throws(() => loadWorkflow('nonexistent-workflow-xyz'), /not found/);
    });

    it('validates loaded data is an object', () => {
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
      const first = listWorkflows()[0];
      const wf = loadWorkflow(first.filename);
      assert.ok(wf.prompt);
    });
  });

  describe('metadata helpers', () => {
    it('finds metadata for workflows that have companion meta files', () => {
      const metaPath = resolveWorkflowMetadataPath('sdxl-refiner');
      assert.ok(metaPath, 'expected metadata path for sdxl-refiner');
      assert.match(metaPath, /sdxl-refiner-api\.(meta|metadata)\.json$/);
    });

    it('loads metadata as an object', () => {
      const meta = loadWorkflowMetadata('sdxl-refiner');
      assert.ok(meta, 'expected metadata object');
      assert.ok(meta.path.endsWith('.json'));
      assert.equal(typeof meta.data, 'object');
      assert.ok(!Array.isArray(meta.data));
    });

    it('returns null when metadata is missing', () => {
      const meta = loadWorkflowMetadata('victorian');
      assert.equal(meta, null);
    });
  });
});
