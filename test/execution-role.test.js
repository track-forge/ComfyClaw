const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('assert');
const {
    loadInputArtifact,
    buildCliCommand,
    saveMetadata
} = require('../scripts/execute-workflow-role.js');

// Mock data
const mockArtifact = {
    workflow: 'test-workflow',
    overrides: {
        '@prompt': 'Test prompt',
        '@negative': 'Test negative',
        '@steps': '20'
    },
    metadata: {
        source: 'test',
        timestamp: '2023-04-15T10:30:00Z'
    }
};

const mockArtifactPath = path.join(__dirname, 'mock-artifact.json');

before(() => {
    // Create mock artifact file
    fs.writeFileSync(mockArtifactPath, JSON.stringify(mockArtifact, null, 2));
});

after(() => {
    // Clean up mock artifact file
    if (fs.existsSync(mockArtifactPath)) {
        fs.unlinkSync(mockArtifactPath);
    }
    
    // Clean up test output directory
    const testOutputDir = path.join(__dirname, '../outputs');
    if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true });
    }
});

test('should load input artifact', () => {
    const artifact = loadInputArtifact(mockArtifactPath);
    assert.deepStrictEqual(artifact, mockArtifact);
});

test('should build CLI command correctly', () => {
    const command = buildCliCommand(mockArtifact);
    assert.ok(command.includes('cli.js'));
    assert.ok(command.includes('--run'));
    assert.ok(command.includes('test-workflow'));
    assert.ok(command.includes('--set'));
    assert.ok(command.includes('@prompt.text=Test prompt'));
    assert.ok(command.includes('@negative.text=Test negative'));
    assert.ok(command.includes('@ksampler.steps=20'));
    // Check that output directory is positional argument (not --output-dir flag)
    assert.ok(!command.includes('--output-dir'));
    // Check that output directory is at the expected position (after --run workflow)
    const outputPath = path.join(__dirname, '../outputs');
    const outputDirIndex = command.indexOf(outputPath);
    assert.ok(outputDirIndex > 0);
    assert.strictEqual(command[outputDirIndex], outputPath);
});

test('should handle missing workflow in artifact', () => {
    const invalidArtifact = { ...mockArtifact };
    delete invalidArtifact.workflow;
    
    assert.throws(() => {
        buildCliCommand(invalidArtifact);
    }, /Workflow name is required in artifact/);
});

test('should save metadata', () => {
    const result = {
        success: true,
        stdout: 'Test output',
        stderr: '',
        timestamp: new Date().toISOString()
    };
    
    const outputPath = path.join(__dirname, '../outputs/test-run');
    fs.mkdirSync(outputPath, { recursive: true });
    
    saveMetadata(result, outputPath);
    
    const metadataPath = path.join(outputPath, 'execution-metadata.json');
    assert.ok(fs.existsSync(metadataPath));
    
    const savedMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    assert.deepStrictEqual(savedMetadata, result);
});