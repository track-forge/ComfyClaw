# Workflow I/O Mapping Schema

This document defines the schema for mapping workflow inputs and outputs to enable structured overrides and predictable artifact generation.

## Overview

Each workflow can optionally include an `input_map` and `output_map` section in its JSON metadata. These maps allow agents and tools to understand and manipulate key aspects of the workflow without requiring deep knowledge of its internal structure.

## Input Map

The `input_map` defines editable controls within the workflow. Each entry corresponds to a tagged node input.

### Schema

```json
{
  "input_map": {
    "<control_key>": {
      "node_id": "<node_id>",
      "input_key": "<input_key>",
      "type": "<data_type>",
      "label": "<human_readable_label>",
      "description": "<optional_description>"
    }
  }
}
```

### Fields

- `control_key`: A stable identifier for this input control (e.g., `main_prompt`, `style_lora`)
- `node_id`: The ComfyUI node ID containing this input
- `input_key`: The specific input field on the node (e.g., `text`, `model_name`)
- `type`: Data type (e.g., `string`, `float`, `boolean`, `image`)
- `label`: Human-readable name for UIs
- `description`: Optional extended description

### Example

```json
{
  "input_map": {
    "main_prompt": {
      "node_id": "15",
      "input_key": "text",
      "type": "string",
      "label": "Main Prompt"
    },
    "cfg_scale": {
      "node_id": "22",
      "input_key": "cfg",
      "type": "float",
      "label": "CFG Scale"
    }
  }
}
```

## Output Map

The `output_map` defines where canonical artifacts are generated and how they should be handled.

### Schema

```json
{
  "output_map": {
    "<artifact_key>": {
      "node_id": "<node_id>",
      "output_index": <index>,
      "type": "<artifact_type>",
      "label": "<human_readable_label>",
      "save_node_tag": "<@save_tag>",
      "description": "<optional_description>"
    }
  }
}
```

### Fields

- `artifact_key`: Stable identifier for this output (e.g., `final_image`, `intermediate_mask`)
- `node_id`: The ComfyUI node ID producing this output
- `output_index`: Index of the output slot (0-based)
- `type`: Artifact type (e.g., `image`, `mask`, `latent`)
- `label`: Human-readable name
- `save_node_tag`: The `@tag` of the Save Image node this output routes to
- `description`: Optional extended description

### Example

```json
{
  "output_map": {
    "final_image": {
      "node_id": "25",
      "output_index": 0,
      "type": "image",
      "label": "Final Image",
      "save_node_tag": "@save_final"
    }
  }
}
```

## Usage

These maps are intended for consumption by:

- ComfyClaw CLI for structured overrides (`--set`)
- Agent role pipelines for dynamic input generation
- Validation tools to verify workflow structure
- UI builders for automatic control generation

## Integration

Workflows using this schema should store the maps under top-level keys:

```json
{
  "input_map": { ... },
  "output_map": { ... },
  "nodes": [ ... ]
}
```