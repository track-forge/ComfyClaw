---
name: comfyclaw
description: Run ComfyUI workflows via CLI. Use --list to discover workflows, --describe to see editable parameters (with live server values), --run to execute with --set @tag overrides. No need to read workflow files directly.
---

# ComfyClaw Skill

A CLI tool for discovering, inspecting, and executing ComfyUI workflows.

> **You do not need to read workflow JSON files.** Use the CLI commands below to discover workflows, see what's editable, and run them.

## Quick Reference

```bash
# If COMFYCLAW_DIR is set, run from anywhere. Otherwise cd to the repo first.
# export COMFYCLAW_DIR=/path/to/ComfyClaw

# List available workflows
node ${COMFYCLAW_DIR:-$PWD}/cli.js --list

# See editable parameters (queries live server for valid values)
node cli.js --describe <workflow>

# Run a workflow with overrides
node cli.js --run <workflow> [outDir] --set @tag.key=value ...
```

---

## 1. Discover Workflows (`--list`)

```bash
node cli.js --list
```

Prints available workflow names. Use these names with `--describe` and `--run`.

---

## 2. Inspect a Workflow (`--describe`)

```bash
node cli.js --describe text2image-example
```

Shows every `@tag` in the workflow and its editable parameters. If a ComfyUI server is reachable, it queries the server to show all valid values for enum inputs (checkpoints, samplers, schedulers). The currently selected value is marked with ★.

**Key rules:**
- **editable** params are safe to override via `--set`
- **linked** params are graph wiring — do NOT override these
- If a workflow has no `@tags`, use raw node IDs (`--set nodeId.key=value`)

### Read Metadata for Context

**After selecting a workflow, read its metadata file** to understand purpose, style, model requirements, and usage guidance:

```bash
# Metadata file location pattern
workflows/<workflow-name>-api.meta.json
```

The metadata provides:
- **purpose** — What the workflow generates
- **style** & **use_cases** — When to use this workflow
- **models** — Recommended checkpoints, LoRAs, trigger words
- **resolution** — Recommended dimensions
- **context.prompt_guidance** — How to write effective prompts
- **caveats** — Known limitations or special requirements

**Example:**
```bash
# After selecting 'sample' workflow, read:
cat workflows/sample-api.meta.json
```

Use this metadata to:
- Choose appropriate prompts (check `context.prompt_guidance`)
- Include required trigger words (see `models.loras[].trigger_words`)
- Select proper resolutions (see `resolution.recommended`)
- Understand workflow limitations (see `caveats`)

---

## 3. Run a Workflow (`--run`)

```bash
node cli.js --run <workflow> [outDir] [--set @tag.key=value ...]
```

### Override syntax

Tag-based (recommended):
```bash
--set @prompt.text="a beautiful sunset over the ocean"
--set @ksampler.steps=30
--set @ksampler.seed=42
```

Node-ID based (for workflows without @tags):
```bash
--set 6.text="a beautiful sunset"
--set 3.steps=30
```

### Full example

```bash
node cli.js --run text2image-example outputs \
  --set @prompt.text="cinematic neon city at night, rain, 35mm" \
  --set @negative.text="watermark, text, logo, blurry" \
  --set @ksampler.seed=111111 \
  --set @ksampler.steps=25 \
  --set @ksampler.cfg=7 \
  --set @size.width=768 \
  --set @size.height=768
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Runtime error (server unavailable, execution failed, timeout) |
| 2 | Usage error (bad arguments, workflow not found) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMFYCLAW_DIR` | (script location) | Path to ComfyClaw repo root. Set this so the CLI can find workflows and outputs from anywhere. |
| `COMFYUI_SERVER` | (auto-select) | Force a specific ComfyUI server URL (e.g. `http://localhost:8188`) |
| `COMFYUI_TIMEOUT_MS` | `180000` | Max wait for workflow completion (ms) |

### Setup

If the user hasn't set `COMFYCLAW_DIR`, ask them where ComfyClaw is installed and recommend:

```bash
export COMFYCLAW_DIR=/path/to/ComfyClaw
```

With `COMFYCLAW_DIR` set, you can run the CLI from any directory:

```bash
node $COMFYCLAW_DIR/cli.js --list
```

---

## 4. Onboarding New Workflows

When adding a new ComfyUI workflow to the repo:

### Requirements
1. **Export as API format** from ComfyUI ("Save (API Format)")
2. **Name:** `workflows/<name>-api.json`
3. **Tag nodes** with `@tags` in `_meta.title`:
   - **Required:** `@save` (on the SaveImage node — output detection depends on this)
   - **Recommended:** `@prompt`, `@negative`, `@ksampler`, `@checkpoint`, `@lora`, `@size`
4. **Each `@tag` must be unique** within a workflow (no duplicates)

### Tag Contract

| Tag | Node Type | Purpose |
|-----|-----------|---------|
| `@save` | SaveImage | **Required.** Output file detection |
| `@prompt` | CLIPTextEncode | Positive prompt override |
| `@negative` | CLIPTextEncode | Negative prompt override |
| `@ksampler` | KSampler / KSamplerAdvanced | Sampler controls (seed, steps, cfg) |
| `@checkpoint` | CheckpointLoaderSimple | Model selection |
| `@lora` | LoraLoader | LoRA selection + strength |
| `@size` | EmptyLatentImage | Resolution controls |

### Audit Script

Run the audit to check all workflows for compliance:

```bash
node scripts/workflow-audit.js [workflow-dir]
```

- Checks required tags (`@save`)
- Warns on missing recommended tags
- Detects duplicate tags, broken node references, untagged SaveImage nodes
- Suggests tags for untagged nodes based on `class_type` heuristics

### Companion Files (optional but recommended)

For each workflow, add metadata and mapping files:
- `workflows/<name>-api.meta.json` — purpose, style, model compatibility, agent context (see `spec/workflow-metadata-schema.md`)
- `workflows/<name>-api.map.json` — input/output mapping for programmatic control (see `spec/workflow-mapping-schema.md`)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "All ComfyUI servers unavailable" | Verify server: `curl http://localhost:8188/api/queue` |
| "No Save node detected" | Workflow needs a SaveImage or `@save` tagged node |
| "Tag @xyz not found" | Run `--describe` to see available tags |
| "Tag @xyz is ambiguous" | Each `@tag` must be unique within a workflow |
| Timeout | Increase `COMFYUI_TIMEOUT_MS` or check server load |
| "Value not in list" | Run `--describe` to see valid values from server |
