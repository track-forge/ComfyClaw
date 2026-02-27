# Workflow Input/Output Mapping Schema

Canonical schema for mapping workflow controls and outputs. Each workflow **may** have a companion `.map.json` file (e.g., `workflows/sdxl-refiner-api.map.json`).

## Schema (v0.1.0)

```jsonc
{
  "version": "0.1.0",
  "workflow": "string",          // Workflow name (matches filename stem)

  "input_map": {
    "prompts": [
      {
        "role": "positive" | "negative",
        "tag": "@prompt" | "@negative" | null,
        "node_id": "string",
        "field": "text",
        "description": "string"  // What this prompt controls
      }
    ],
    "models": [
      {
        "role": "base" | "refiner" | "lora",
        "tag": "@checkpoint" | "@lora" | null,
        "node_id": "string",
        "field": "ckpt_name" | "lora_name",
        "description": "string"
      }
    ],
    "sampler": [
      {
        "tag": "@ksampler" | null,
        "node_id": "string",
        "fields": {
          "seed": { "type": "int", "description": "Random seed" },
          "steps": { "type": "int", "range": [1, 150], "description": "Sampling steps" },
          "cfg": { "type": "float", "range": [1.0, 30.0], "description": "CFG scale" },
          "sampler_name": { "type": "enum", "description": "Sampler algorithm" },
          "scheduler": { "type": "enum", "description": "Noise scheduler" },
          "denoise": { "type": "float", "range": [0.0, 1.0], "description": "Denoise strength" }
        }
      }
    ],
    "latent": [
      {
        "node_id": "string",
        "fields": {
          "width": { "type": "int", "description": "Image width" },
          "height": { "type": "int", "description": "Image height" },
          "batch_size": { "type": "int", "description": "Batch size" }
        }
      }
    ],
    "other": []                  // Extensible: masks, controlnet inputs, etc.
  },

  "output_map": {
    "save_nodes": [
      {
        "tag": "@save" | null,
        "node_id": "string",
        "field": "filename_prefix",
        "description": "Output image save node"
      }
    ],
    "artifact_path": "ComfyUI/output/{filename_prefix}_{counter}.png"
  }
}
```

## Mapping Conventions

- **`tag`**: The `@tag` from `_meta.title` if present; `null` if workflow uses raw node IDs only.
- **`role`**: Semantic role of the input (positive/negative prompt, base/refiner model, etc.).
- **`node_id`**: The actual node ID in the workflow JSON — always present as fallback.
- **`fields`**: For sampler/latent nodes, enumerate all editable fields with type info.

## How Roles Consume Mappings

1. **Prompt Composer** → reads `input_map.prompts` to know where to inject text
2. **Model Selector** → reads `input_map.models` to swap checkpoints/LoRAs
3. **Executor** → reads full map to construct `--set` overrides for `cli.js --run`
4. **Output Handler** → reads `output_map` to locate and deliver artifacts

## Example

See `workflows/sdxl-refiner-api.map.json` for a concrete mapping.
