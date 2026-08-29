#!/usr/bin/env node

// ComfyClaw Execution Role Script
// Consumes role handoff artifacts and runs ComfyClaw CLI jobs

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

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
        'cli.js',
        '--run', workflow
    ];

    // Add overrides with dot notation (@tag.field=value)
    const overrideArgs = [];
    Object.entries(overrides).forEach(([tag, value]) => {
        // Convert flat tag to dot notation if needed
        // e.g., @prompt -> @prompt.text, @ksampler -> @ksampler.steps
        let formattedTag = tag;
        if (tag === '@prompt' || tag === '@negative') {
            formattedTag = `${tag}.text`;
        } else if (tag === '@steps' || tag === '@seed') {
            formattedTag = `@ksampler.${tag.substring(1)}`;
        } else if (tag === '@checkpoint') {
            formattedTag = `${tag}.name`;
        }
        overrideArgs.push('--set', `${formattedTag}=${value}`);
    });

    // Add output directory as positional argument (must come after --run but before --set)
    args.push(OUTPUTS_DIR);

    // Add override arguments
    args.push(...overrideArgs);

    return args;
}

/**
 * Execute ComfyClaw CLI command asynchronously
 * @param {Array<string>} command - Command arguments
 * @returns {Promise<Object>} Execution result
 */
async function executeCommand(command) {
    const [executable, ...args] = command;
    console.log(`Executing: ${executable} ${args.join(' ')}`);

    return new Promise((resolve) => {
        const child = execFile(executable, args, {
            cwd: BASE_DIR,
            timeout: 60000 // 60 second timeout
        }, (error, stdout, stderr) => {
            if (error) {
                resolve({
                    success: false,
                    stdout: stdout || '',
                    stderr: stderr || error.message,
                    timestamp: new Date().toISOString(),
                    exitCode: error.code || 1
                });
            } else {
                resolve({
                    success: true,
                    stdout,
                    stderr: stderr || '',
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Handle timeout
        child.on('error', (error) => {
            resolve({
                success: false,
                stdout: '',
                stderr: error.message,
                timestamp: new Date().toISOString(),
                exitCode: 1
            });
        });
    });
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
async function main() {
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
        const result = await executeCommand(command);
        
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
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = {
    loadInputArtifact,
    buildCliCommand,
    executeCommand,
    saveMetadata
};