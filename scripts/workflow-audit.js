#!/usr/bin/env node
/**
 * workflow-audit.js — Audit ComfyClaw workflow files for tagging compliance.
 *
 * Usage:
 *   node scripts/workflow-audit.js [workflow-dir]
 *
 * Scans all *-api.json files in the workflows directory (default: ./workflows)
 * and checks for required/recommended @tags, disconnected nodes, and common issues.
 *
 * Exit codes:
 *   0 — all workflows pass
 *   1 — one or more errors found
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_TAGS = ['@save'];
const RECOMMENDED_TAGS = ['@prompt', '@negative', '@ksampler', '@checkpoint'];

// Heuristic: class_type → suggested tag
const TAG_SUGGESTIONS = {
  CLIPTextEncode: (node, id, allNodes) => {
    // Try to guess positive vs negative from content or wiring
    const text = (node.inputs?.text || '').toLowerCase();
    if (text.includes('watermark') || text.includes('ugly') || text.includes('blurry') || text.includes('deformed')) {
      return '@negative';
    }
    return '@prompt';
  },
  KSampler: () => '@ksampler',
  KSamplerAdvanced: () => '@ksampler',
  CheckpointLoaderSimple: () => '@checkpoint',
  LoraLoader: () => '@lora',
  LoraLoaderModelOnly: () => '@lora',
  SaveImage: () => '@save',
  EmptyLatentImage: () => '@size',
  VAEDecode: null, // No tag needed typically
};

function getTag(node) {
  const title = node?._meta?.title || '';
  return title.startsWith('@') ? title : null;
}

function auditWorkflow(filePath) {
  const name = path.basename(filePath);
  const errors = [];
  const warnings = [];
  const suggestions = [];

  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { name, errors: [`Failed to parse JSON: ${e.message}`], warnings: [], suggestions: [] };
  }

  const nodeIds = Object.keys(workflow);
  if (nodeIds.length === 0) {
    return { name, errors: ['Empty workflow (no nodes)'], warnings: [], suggestions: [] };
  }

  // Collect existing tags
  const tags = {};
  const taggedNodes = new Set();
  for (const id of nodeIds) {
    const tag = getTag(workflow[id]);
    if (tag) {
      if (tags[tag]) {
        errors.push(`Duplicate tag "${tag}" on nodes ${tags[tag]} and ${id}`);
      }
      tags[tag] = id;
      taggedNodes.add(id);
    }
  }

  // Check required tags
  for (const req of REQUIRED_TAGS) {
    if (!tags[req]) {
      errors.push(`Missing required tag "${req}" — output detection will fail`);
    }
  }

  // Check recommended tags
  for (const rec of RECOMMENDED_TAGS) {
    if (!tags[rec]) {
      warnings.push(`Missing recommended tag "${rec}" — --describe and --set will be limited`);
    }
  }

  // Verify @save node is actually a SaveImage
  if (tags['@save']) {
    const saveNode = workflow[tags['@save']];
    if (saveNode && !saveNode.class_type?.includes('Save') && !saveNode.class_type?.includes('Preview')) {
      errors.push(`Node tagged @save (${tags['@save']}) has class_type "${saveNode.class_type}" — expected SaveImage or similar`);
    }
  }

  // Check for disconnected save nodes (SaveImage without @save tag)
  for (const id of nodeIds) {
    const node = workflow[id];
    if (node.class_type === 'SaveImage' && !taggedNodes.has(id) && getTag(node) !== '@save') {
      warnings.push(`SaveImage node ${id} exists but is not tagged @save`);
    }
  }

  // Verify all linked references point to existing nodes
  for (const id of nodeIds) {
    const inputs = workflow[id].inputs || {};
    for (const [key, value] of Object.entries(inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
        if (!workflow[value[0]]) {
          errors.push(`Node ${id} input "${key}" references non-existent node ${value[0]}`);
        }
      }
    }
  }

  // Generate tag suggestions for untagged nodes
  for (const id of nodeIds) {
    const node = workflow[id];
    if (taggedNodes.has(id)) continue;
    const suggestFn = TAG_SUGGESTIONS[node.class_type];
    if (suggestFn) {
      const suggested = suggestFn(node, id, workflow);
      if (suggested && !tags[suggested]) {
        suggestions.push(`Node ${id} (${node.class_type}) → suggest tagging as "${suggested}"`);
      }
    }
  }

  return { name, errors, warnings, suggestions };
}

function main() {
  const workflowDir = process.argv[2] || path.join(__dirname, '..', 'workflows');
  
  if (!fs.existsSync(workflowDir)) {
    console.error(`Workflow directory not found: ${workflowDir}`);
    process.exit(2);
  }

  const files = fs.readdirSync(workflowDir)
    .filter(f => f.endsWith('-api.json') && !f.endsWith('.meta.json') && !f.endsWith('.map.json'))
    .map(f => path.join(workflowDir, f));

  if (files.length === 0) {
    console.log('No *-api.json workflow files found.');
    process.exit(0);
  }

  let hasErrors = false;

  for (const file of files) {
    const result = auditWorkflow(file);
    const icon = result.errors.length > 0 ? '❌' : result.warnings.length > 0 ? '⚠️' : '✅';
    
    console.log(`\n${icon}  ${result.name}`);
    
    for (const e of result.errors) {
      console.log(`   ERROR: ${e}`);
      hasErrors = true;
    }
    for (const w of result.warnings) {
      console.log(`   WARN:  ${w}`);
    }
    for (const s of result.suggestions) {
      console.log(`   HINT:  ${s}`);
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0 && result.suggestions.length === 0) {
      console.log('   All checks passed.');
    }
  }

  console.log(`\n--- Scanned ${files.length} workflow(s) ---`);
  process.exit(hasErrors ? 1 : 0);
}

main();
