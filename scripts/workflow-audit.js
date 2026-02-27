#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get workflow directory from command line or default to ./workflows
const workflowDir = process.argv[2] || './workflows';

console.log(`🔍 Auditing workflows in ${workflowDir}...\n`);

// Check if workflow directory exists
if (!fs.existsSync(workflowDir)) {
  console.error(`❌ Error: Workflow directory '${workflowDir}' not found`);
  process.exit(1);
}

// Get all JSON files in the workflow directory
const workflowFiles = fs.readdirSync(workflowDir)
  .filter(file => file.endsWith('.json') && !file.startsWith('.'));

if (workflowFiles.length === 0) {
  console.log('⚠️  No workflow files found');
  process.exit(0);
}

let totalWorkflows = 0;
let validWorkflows = 0;
let issuesFound = false;

// Process each workflow file
for (const file of workflowFiles) {
  totalWorkflows++;
  const filePath = path.join(workflowDir, file);
  console.log(`📄 ${file}:`);
  
  try {
    const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Check for required @save tag
    const saveNodes = [];
    const tags = {};
    
    for (const [nodeId, node] of Object.entries(workflowData)) {
      if (node._meta && node._meta.title) {
        const title = node._meta.title;
        
        // Check for @save tag
        if (title.includes('@save')) {
          saveNodes.push({ id: nodeId, title });
        }
        
        // Extract all tags
        const tagMatches = title.match(/@\w+/g);
        if (tagMatches) {
          for (const tag of tagMatches) {
            if (!tags[tag]) tags[tag] = [];
            tags[tag].push({ id: nodeId, title });
          }
        }
      }
    }
    
    // Validate required tags
    const errors = [];
    const warnings = [];
    
    if (saveNodes.length === 0) {
      errors.push('Missing required @save tag');
    } else if (saveNodes.length > 1) {
      warnings.push(`Multiple @save tags found (${saveNodes.length})`);
    }
    
    // Report findings
    if (errors.length > 0) {
      console.log(`  ❌ Errors:`);
      errors.forEach(err => console.log(`    - ${err}`));
      issuesFound = true;
    }
    
    if (warnings.length > 0) {
      console.log(`  ⚠️  Warnings:`);
      warnings.forEach(warn => console.log(`    - ${warn}`));
    }
    
    if (errors.length === 0) {
      console.log(`  ✅ Valid`);
      validWorkflows++;
      
      if (Object.keys(tags).length > 0) {
        console.log(`  🏷  Tags: ${Object.keys(tags).join(', ')}`);
      }
    }
    
  } catch (err) {
    console.log(`  ❌ Failed to parse: ${err.message}`);
    issuesFound = true;
  }
  
  console.log('');
}

// Summary
console.log(`📊 Audit Summary:`);
console.log(`  Total workflows: ${totalWorkflows}`);
console.log(`  Valid workflows: ${validWorkflows}`);
console.log(`  Invalid workflows: ${totalWorkflows - validWorkflows}`);

if (issuesFound) {
  console.log(`\n🚨 Issues found in ${totalWorkflows - validWorkflows} workflow(s)`);
  process.exit(1);
} else {
  console.log(`\n✅ All workflows passed validation`);
  process.exit(0);
}