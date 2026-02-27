# Workflow Metadata Schema

Canonical schema for describing ComfyClaw workflows. Each workflow **may** have a companion `.meta.json` file alongside its API JSON (e.g., `workflows/sdxl-refiner-api.meta.json`).

## Schema (v0.1.0)

```jsonc
{
  // Required
  "name": "string",              // Human-readable workflow name
  "version": "string",           // Schema version (semver)
  "purpose": "string",           // What this workflow does (1-2 sentences)

  // Style & Use-Case
  "style": ["string"],           // Style tags: "photorealistic", "illustrative", "anime", "abstract", "portrait", "landscape", etc.
  "use_cases": ["string"],       // When to use: "general-purpose", "character-portrait", "product-shot", "concept-art", etc.

  // Model Compatibility
  "models": {
    "base": {
      "architecture": "string",  // "sdxl", "sd15", "flux", "sd3", etc.
      "recommended": ["string"], // Recommended checkpoint filenames
      "compatible": ["string"]   // Other known-working checkpoints
    },
    "refiner": {                 // Optional — only if workflow uses a refiner pass
      "architecture": "string",
      "recommended": ["string"]
    },
    "loras": [                   // Optional
      {
        "name": "string",        // LoRA filename
        "trigger_words": ["string"],
        "purpose": "string",     // What the LoRA adds
        "strength_range": [0.0, 1.0]  // Recommended min/max strength
      }
    ]
  },

  // Runtime Notes
  "resolution": {
    "default": [1024, 1024],     // [width, height]
    "recommended": [[1024, 1024], [1152, 896], [896, 1152]]
  },
  "estimated_time_seconds": 10,  // Rough estimate on target hardware
  "vram_minimum_gb": 8,          // Minimum VRAM to run
  "caveats": ["string"],         // Known issues, gotchas, limitations

  // Agent Context (issue #12)
  "context": {
    "summary": "string",         // Agent-facing plain-English description
    "prompt_guidance": "string", // Tips for writing good prompts for this workflow
    "caution": "string"          // Things to avoid or watch out for
  }
}
```

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Display name |
| `version` | ✅ | Schema version, currently `"0.1.0"` |
| `purpose` | ✅ | One-liner describing what the workflow produces |
| `style` | recommended | Helps agents select the right workflow for a request |
| `use_cases` | recommended | Semantic use-case tags |
| `models.base` | ✅ | Primary model info |
| `models.refiner` | optional | Only for refiner workflows |
| `models.loras` | optional | LoRA compatibility info |
| `resolution` | recommended | Prevents bad dimension choices |
| `estimated_time_seconds` | optional | Helps with timeout planning |
| `vram_minimum_gb` | optional | Prevents OOM on undersized hardware |
| `caveats` | optional | Freeform gotchas |
| `context` | recommended | Agent-facing guidance for workflow selection and prompting |

## Naming Convention

Metadata files live alongside workflow JSON:
```
workflows/
  sdxl-refiner-api.json
  sdxl-refiner-api.meta.json
  text2image-example-api.json
  text2image-example-api.meta.json
```
