# Path Conventions for ComfyClaw

This document outlines the path normalization strategy for ComfyClaw to ensure packaging safety and consistent file resolution across different environments.

## Core Principle

All paths within ComfyClaw must be relative and resolved using a base directory placeholder: `{baseDir}`. This allows the system to dynamically adjust to the runtime environment without hardcoding machine-specific absolute paths.

## Path Resolution

- `{baseDir}` refers to the root directory of the ComfyClaw installation.
- All internal file references (e.g., workflows, configs, scripts) must use paths relative to `{baseDir}`.
- Example: A workflow file located at `workflows/my-workflow.json` would be referenced as `{baseDir}/workflows/my-workflow.json`.

## Implementation Guidelines

### In Documentation
- Always use `{baseDir}` when referring to internal files or directories.
- Avoid mentioning absolute paths like `/home/user/...` or `C:\Users\...`.

### In Scripts
- Resolve `{baseDir}` at runtime to the actual installation directory.
- Use path joining utilities (e.g., `path.join()` in Node.js) to construct full paths.

### In Configuration Files
- Where applicable, define paths relative to `{baseDir}`.
- Ensure loaders or parsers understand and replace `{baseDir}` with the correct value.

## Acceptance Criteria
- No hardcoded absolute paths in documentation, scripts, or configuration files.
- All paths are verified to resolve correctly with `{baseDir}` substitution.
- Spot checks confirm compliance across key files.

This convention ensures that ComfyClaw remains portable and secure across different deployment scenarios.