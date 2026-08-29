# Path Normalization Strategy

To ensure ComfyClaw workflows and scripts are portable and packaging-safe, we use a consistent path normalization approach.

## Core Principle

All paths within ComfyClaw must be relative to a dynamic base directory (`{baseDir}`), allowing the entire skill to be relocated or packaged without breaking internal references.

## Conventions

- **Workflow References**: Workflows must refer to other workflows, scripts, or resources using `{baseDir}/relative/path`.
- **Script Resolution**: Scripts that load files must resolve paths dynamically from their own location or accept a base directory parameter.
- **Configuration Files**: Config files should avoid absolute paths; use `{baseDir}` placeholders where necessary.

## Implementation

- Replace hardcoded absolute paths (e.g., `/home/user/ComfyClaw/...`) with `{baseDir}/...`.
- In Node.js scripts, use `path.resolve(__dirname, '../relative/path')` or similar patterns.
- For documentation, always use `{baseDir}` as a placeholder.

## Validation

- Regular expression checks in `scripts/workflow-audit.js` ensure no absolute paths slip through.
- Manual spot-checks during reviews confirm compliance.

## References

- Original issue: https://github.com/track-forge/openclaw-skill-social-ops/issues/18
- Related PR: #16