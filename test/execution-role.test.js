const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
    loadInputArtifact,
    buildCliCommand,
    executeCommand,
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

// Test suite
describe('Execution Role Script', () => {
    beforeAll(() => {
        // Create mock artifact file
        fs.writeFileSync(mockArtifactPath, JSON.stringify(mockArtifact, null, 2));
    });

    afterAll(() => {
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
        expect(artifact).toEqual(mockArtifact);
    });

    test('should build CLI command correctly', () => {
        const command = buildCliCommand(mockArtifact);
        expect(command).toContain('node');
        expect(command).toContain('cli.js');
        expect(command).toContain('--run');
        expect(command).toContain('test-workflow');
        expect(command).toContain('--set');
        expect(command).toContain('@prompt=Test prompt');
        expect(command).toContain('--output-dir');
    });

    test('should handle missing workflow in artifact', () => {
        const invalidArtifact = { ...mockArtifact };
        delete invalidArtifact.workflow;
        
        expect(() => {
            buildCliCommand(invalidArtifact);
        }).toThrow('Workflow name is required in artifact');
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
        expect(fs.existsSync(metadataPath)).toBe(true);
        
        const savedMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        expect(savedMetadata).toEqual(result);
    });
});