#!/usr/bin/env node

// ComfyClaw Execution Role Script
// Consumes role handoff artifacts and runs ComfyClaw CLI jobs

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Constants
const BASE_DIR = process.env.BASE_DIR || path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(BASE_DIR, 'artifacts');
const OUTPUTS_DIR = path.join(BASE_DIR, 'outputs');

/**
 * Load role input artifact (JSON)
 * @param {string} artifactPath - Path to the input artifact
 * @returns {Object} Parsed artifact data
 */
function loadInputArtifact(artifactPath) {
    const fullPath = path.resolve(artifactPath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Input artifact not found: ${fullPath}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

/**
 * Build ComfyClaw CLI command from artifact
 * @param {Object} artifact - Role input artifact
 * @returns {Array<string>} Command arguments
 */
function buildCliCommand(artifact) {
    const { workflow, overrides = {}, metadata = {} } = artifact;
    
    if (!workflow) {
        throw new Error('Workflow name is required in artifact');
    }

    const args = [
        'node', 'cli.js',
        '--run', workflow
    ];

    // Add overrides
    Object.entries(overrides).forEach(([tag, value]) => {
        args.push('--set', `${tag}=${value}`);
    });

    // Add output directory
    args.push('--output-dir', OUTPUTS_DIR);

    return args;
}

/**
 * Execute ComfyClaw CLI command
 * @param {Array<string>} command - Command arguments
 * @returns {Object} Execution result
 */
function executeCommand(command) {
    const cmdString = command.join(' ');
    console.log(`Executing: ${cmdString}`);

    try {
        const stdout = execSync(cmdString, {
            cwd: BASE_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf-8'
        });
        
        return {
            success: true,
            stdout,
            stderr: '',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            success: false,
            stdout: error.stdout || '',
            stderr: error.stderr || error.message,
            timestamp: new Date().toISOString(),
            exitCode: error.status || 1
        };
    }
}

/**
 * Save execution metadata
 * @param {Object} result - Execution result
 * @param {string} outputPath - Output directory
 */
function saveMetadata(result, outputPath) {
    const metadataPath = path.join(outputPath, 'execution-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(result, null, 2));
    console.log(`Metadata saved to: ${metadataPath}`);
}

/**
 * Main execution function
 */
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node execute-workflow-role.js <input-artifact-path>');
        process.exit(1);
    }

    const inputArtifactPath = args[0];
    
    try {
        // Load input artifact
        const artifact = loadInputArtifact(inputArtifactPath);
        console.log('Loaded input artifact:', artifact);

        // Build CLI command
        const command = buildCliCommand(artifact);
        
        // Execute command
        const result = executeCommand(command);
        
        // Create output directory
        const outputPath = path.join(OUTPUTS_DIR, `run-${Date.now()}`);
        fs.mkdirSync(outputPath, { recursive: true });
        
        // Save metadata
        saveMetadata(result, outputPath);
        
        // Report result
        if (result.success) {
            console.log('Workflow executed successfully!');
            console.log('Output directory:', outputPath);
        } else {
            console.error('Workflow execution failed:');
            console.error(result.stderr);
            process.exit(result.exitCode || 1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    loadInputArtifact,
    buildCliCommand,
    executeCommand,
    saveMetadata
};