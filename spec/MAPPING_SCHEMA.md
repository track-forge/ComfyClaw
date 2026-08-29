# Workflow Mapping Schema

This document defines the schema for mapping ComfyUI workflows to structured inputs and outputs for programmatic use in ComfyClaw.

## Overview

Each workflow can define a `mapping` section that specifies:
- Which nodes are editable inputs (`input_map`)
- Which nodes produce canonical outputs (`output_map`)
- Metadata about the workflow itself (`metadata`)

This allows tools like ComfyClaw to dynamically understand and interact with workflows without hardcoding knowledge of specific node IDs.

## Schema Structure

```json
{
  "mapping": {
    "input_map": {
      // key-value pairs: logical_name -> node_info
    },
    "output_map": {
      // key-value pairs: logical_name -> node_info
    },
    "metadata": {
      // key-value pairs: metadata fields
    }
  }
}
```

### Node Info Object

Used in both `input_map` and `output_map`.

```json
{
  "node_id": "123",
  "type": "NodeType",
  "field": "fieldname"
}
```

- `node_id`: The numeric ID of the node in the workflow JSON.
- `type`: The class type of the node (e.g., `CLIPTextEncode`, `SaveImage`).
- `field`: The field name within the node to target (e.g., `text`, `filename_prefix`).

### Metadata Fields

Arbitrary key-value pairs describing the workflow.

Common fields:
- `title`: Human-readable title
- `description`: Brief explanation of what the workflow does
- `author`: Creator or maintainer
- `version`: Version string
- `compatibility`: List of compatible models/checkpoints
- `caveats`: Special notes or requirements

## Example

Example mapping for a basic txt2img workflow:

```json
{
  "mapping": {
    "input_map": {
      "positive_prompt": {
        "node_id": "6",
        "type": "CLIPTextEncode",
        "field": "text"
      },
      "negative_prompt": {
        "node_id": "7",
        "type": "CLIPTextEncode",
        "field": "text"
      },
      "seed": {
        "node_id": "25",
        "type": "SeedGenerator",
        "field": "seed"
      }
    },
    "output_map": {
      "final_image": {
        "node_id": "9",
        "type": "SaveImage",
        "field": "filename_prefix"
      }
    },
    "metadata": {
      "title": "Basic Text to Image",
      "description": "Generates an image from positive and negative text prompts.",
      "author": "GladeRunner",
      "version": "1.0.0",
      "compatibility": ["SDXL 1.0", "Realistic Vision"],
      "caveats": "Works best with 1024x1024 resolutions."
    }
  }
}
```

This schema enables tools to:
- Dynamically present editable fields to users
- Know which nodes produce the final outputs
- Understand context about the workflow's purpose and usage