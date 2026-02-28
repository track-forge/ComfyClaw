# Packaging-Safe Paths with `{baseDir}`

To ensure ComfyClaw workflows and tools work reliably across different environments and packaging scenarios, we use a placeholder convention for paths that are resolved at runtime.

## The `{baseDir}` Placeholder

- **What it is**: A placeholder that resolves to the root directory of the ComfyClaw installation at runtime.
- **Where to use it**: In documentation, scripts, and configuration files where paths need to be environment-agnostic.
- **Why it matters**: Hardcoded absolute paths (like `/home/dev/...`) break when the project is moved, packaged, or run on another machine.

## Example Usage

Instead of:
```
/home/dev/.openclaw/workspace/codebase/ComfyClaw/workflows/
```

Use:
```
{baseDir}/workflows/
```

This allows the system to dynamically resolve the correct path regardless of where ComfyClaw is installed.

## Implementation

- Scripts and tools should replace `{baseDir}` with the actual root directory of the ComfyClaw installation at startup.
- Documentation should consistently use `{baseDir}` when referring to project-relative paths.
- Configuration files should avoid absolute paths and use `{baseDir}` where necessary.

## Files Checked

As of 2026-02-28, the following files have been reviewed and confirmed to be free of hardcoded absolute paths:

- `spec/workflow-mapping-schema.md`
- `spec/workflow-metadata-schema.md`
- `workflows/sdxl-refiner-api.map.json`
- `workflows/sdxl-refiner-api.meta.json`
- `workflows/text2image-example-api.map.json`
- `workflows/text2image-example-api.meta.json`

Any new documentation or scripts should follow this convention.