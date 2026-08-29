# Execution Role Integration

This document describes how the Execution Role integrates with the ComfyClaw CLI to run workflows based on role handoff artifacts.

## Overview

The Execution Role consumes structured input artifacts from previous roles (Prompting, Queueing) and executes ComfyClaw workflows with appropriate overrides and configurations.

## Input Artifact Structure

The Execution Role expects a JSON input artifact with the following structure:

```json
{
  "workflow": "workflow-name",
  "overrides": {
    "@prompt": "A beautiful landscape",
    "@negative": "blurry, low quality",
    "@steps": "30"
  },
  "metadata": {
    "source": "prompt-role-v1",
    "timestamp": "2023-04-15T10:30:00Z"
  }
}
```

## Execution Process

1. **Load Artifact**: The script loads the input artifact JSON file
2. **Build Command**: Constructs the ComfyClaw CLI command with workflow name and overrides
3. **Execute Workflow**: Runs the ComfyClaw CLI command
4. **Capture Metadata**: Saves execution metadata including success/failure status
5. **Output Results**: Places generated images and metadata in the output directory

## Script Usage

```bash
node scripts/execute-workflow-role.js <input-artifact-path>
```

## Example

Given an input artifact `artifacts/prompt-output.json`:

```json
{
  "workflow": "sdxl-refiner",
  "overrides": {
    "@prompt": "A majestic mountain landscape at sunrise",
    "@negative": "people, cars, buildings",
    "@steps": "40",
    "@cfg": "7.5"
  }
}
```

Running the script:

```bash
node scripts/execute-workflow-role.js artifacts/prompt-output.json
```

Will execute:
```bash
node cli.js --run sdxl-refiner --set @prompt=A majestic mountain landscape at sunrise --set @negative=people, cars, buildings --set @steps=40 --set @cfg=7.5 --output-dir ./outputs
```

## Output Structure

After execution, the following files will be created in a timestamped output directory:

- Generated images (PNG/JPEG)
- `execution-metadata.json`: Contains execution details including success status, stdout/stderr, and timestamps

## Path Normalization

All paths in the script use `{baseDir}`-safe conventions, ensuring compatibility across different environments and packaging scenarios.

## Error Handling

The script handles common failure modes:
- Missing input artifacts
- Invalid workflow names
- ComfyClaw execution errors
- Permission issues

Errors are logged to stderr and result in non-zero exit codes.