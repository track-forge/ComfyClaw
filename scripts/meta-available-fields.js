#!/usr/bin/env node
/**
 * meta-available-fields.js
 *
 * Adds/updates `available_fields` in a workflow companion .meta.json file
 * by inspecting tagged nodes in a ComfyUI API workflow JSON.
 *
 * Usage:
 *   node scripts/meta-available-fields.js <workflow-name-or-path> [--dry-run]
 *
 * Examples:
 *   node scripts/meta-available-fields.js zimage-turbo
 *   node scripts/meta-available-fields.js workflows/zimage-turbo-api.json
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  loadWorkflow,
  resolveWorkflowMetadataPath,
  WORKFLOWS_DIR,
} = require('../workflows');

function isScalar(v) {
  return (
    v === null ||
    v === undefined ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  );
}

function getWorkflowFromArg(workflowArg) {
  if (!workflowArg) {
    throw new Error('Missing workflow argument. Usage: node scripts/meta-available-fields.js <workflow-name-or-path> [--dry-run]');
  }

  const rawPath = path.isAbsolute(workflowArg)
    ? workflowArg
    : path.resolve(process.cwd(), workflowArg);

  if (fs.existsSync(rawPath)) {
    const prompt = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const filename = path.basename(rawPath);
    const name = filename.replace(/-api\.json$/, '').replace(/\.json$/, '');
    return { name, path: rawPath, prompt };
  }

  return loadWorkflow(workflowArg);
}

function deriveMetadataPath(workflowName, workflowPath) {
  const existing = resolveWorkflowMetadataPath(workflowName);
  if (existing) return existing;

  if (workflowPath.endsWith('-api.json')) {
    return workflowPath.replace(/-api\.json$/, '-api.meta.json');
  }

  const candidate = path.join(WORKFLOWS_DIR, `${workflowName}-api.meta.json`);
  return candidate;
}

function collectAvailableFields(prompt) {
  const out = [];

  const nodeEntries = Object.entries(prompt || {});
  for (const [, node] of nodeEntries) {
    const title = node?._meta?.title;
    if (typeof title !== 'string' || !title.startsWith('@')) continue;

    const tagName = title.slice(1);
    if (!tagName) continue;

    const inputs = node?.inputs || {};
    for (const [key, value] of Object.entries(inputs)) {
      if (!isScalar(value)) continue;
      out.push(`${tagName}.${key}`);
    }
  }

  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

function run(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const workflowArg = args.find((a) => !a.startsWith('--'));

  const workflow = getWorkflowFromArg(workflowArg);
  const metadataPath = deriveMetadataPath(workflow.name, workflow.path);
  const availableFields = collectAvailableFields(workflow.prompt);

  let meta = {};
  if (fs.existsSync(metadataPath)) {
    meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new Error(`Metadata file is not a JSON object: ${metadataPath}`);
    }
  }

  meta.available_fields = availableFields;

  if (dryRun) {
    console.log(JSON.stringify({ metadata_path: metadataPath, available_fields: availableFields }, null, 2));
    return;
  }

  fs.writeFileSync(metadataPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  console.log(`Updated metadata: ${metadataPath}`);
  console.log(`Available fields (${availableFields.length}):`);
  for (const f of availableFields) {
    console.log(`  - ${f}`);
  }
}

if (require.main === module) {
  try {
    run(process.argv);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  collectAvailableFields,
};
