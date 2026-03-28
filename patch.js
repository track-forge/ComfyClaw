// patch.js
// Utilities to apply safe overrides to an API prompt graph.

function coerceValue(raw) {
  // Best-effort coercion from CLI/env strings.
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === 'undefined') return undefined;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);

  // JSON objects/arrays
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      return JSON.parse(raw);
    } catch {
      // fallthrough
    }
  }

  return raw;
}

function resolveTagInputAlias(node, tag, key) {
  if (!node?.inputs || typeof node.inputs !== 'object') return key;
  if (key in node.inputs) return key;

  // Normalize prompt-like tags so callers can use either .text or .value.
  const promptLikeTags = new Set(['@prompt', '@negative']);
  if (!promptLikeTags.has(tag)) return key;

  if (key === 'text' && 'value' in node.inputs) return 'value';
  if (key === 'value' && 'text' in node.inputs) return 'text';

  return key;
}

/**
 * Apply overrides to an API prompt.
 *
 * overrides format:
 * {
 *   "6": {"text": "new prompt"},
 *   "3": {"seed": 123, "steps": 30}
 * }
 */
function applyNodeInputOverrides(apiPrompt, overrides) {
  if (!overrides) return { apiPrompt, applied: [], skipped: [] };

  const applied = [];
  const skipped = [];

  for (const [nodeId, inputs] of Object.entries(overrides)) {
    const node = apiPrompt[nodeId];
    if (!node) {
      skipped.push({ nodeId, reason: 'node_not_found' });
      continue;
    }
    if (!node.inputs || typeof node.inputs !== 'object') node.inputs = {};

    for (const [k, v] of Object.entries(inputs || {})) {
      // Do not allow overriding linked inputs (arrays like ["4",0]) unless explicitly intended.
      if (Array.isArray(node.inputs[k])) {
        skipped.push({ nodeId, key: k, reason: 'linked_input_refuse_override' });
        continue;
      }
      node.inputs[k] = v;
      applied.push({ nodeId, key: k, value: v });
    }
  }

  return { apiPrompt, applied, skipped };
}

/**
 * Parse a --set style list:
 *   ["6.text=hello", "3.steps=30"]
 * into overrides object.
 */
function parseSetArgs(setArgs) {
  const overrides = {};
  for (const s of setArgs || []) {
    const idxEq = s.indexOf('=');
    if (idxEq === -1) throw new Error(`Invalid --set '${s}'. Expected nodeId.key=value`);
    const left = s.slice(0, idxEq);
    const raw = s.slice(idxEq + 1);
    const idxDot = left.indexOf('.');
    if (idxDot === -1) throw new Error(`Invalid --set '${s}'. Expected nodeId.key=value`);
    const nodeId = left.slice(0, idxDot);
    const key = left.slice(idxDot + 1);

    overrides[nodeId] ||= {};
    overrides[nodeId][key] = coerceValue(raw);
  }
  return overrides;
}

/**
 * Resolve tag-based overrides (@tag.key=value) to node-id-based overrides.
 *
 * Accepts the raw --set args array and an API prompt graph.
 * Returns a unified overrides object (keyed by node ID) ready for applyNodeInputOverrides().
 *
 * Tag format:  @tagname.key=value  (e.g. @prompt.text="hello")
 * Node format: nodeId.key=value    (e.g. 6.text="hello")
 *
 * Rules:
 * - A @tag must match exactly one node (by _meta.title). Zero or >1 → error.
 * - Node-id overrides are passed through as-is.
 */
function resolveTagOverrides(apiPrompt, setArgs) {
  const overrides = {};

  for (const s of setArgs || []) {
    const idxEq = s.indexOf('=');
    if (idxEq === -1) throw new Error(`Invalid --set '${s}'. Expected @tag.key=value or nodeId.key=value`);
    const left = s.slice(0, idxEq);
    const raw = s.slice(idxEq + 1);
    const idxDot = left.indexOf('.');
    if (idxDot === -1) throw new Error(`Invalid --set '${s}'. Expected @tag.key=value or nodeId.key=value`);

    const prefix = left.slice(0, idxDot);
    const key = left.slice(idxDot + 1);

    let nodeId;

    if (prefix.startsWith('@')) {
      // Tag-based: resolve @tag to node ID
      const tag = prefix; // e.g. "@prompt"
      const matches = [];
      for (const [nid, node] of Object.entries(apiPrompt)) {
        if (node?._meta?.title === tag) {
          matches.push(nid);
        }
      }
      if (matches.length === 0) {
        throw new Error(`Tag "${tag}" not found in workflow. No node has _meta.title === "${tag}".`);
      }
      if (matches.length > 1) {
        throw new Error(`Tag "${tag}" is ambiguous: matched nodes [${matches.join(', ')}]. Each @tag must be unique.`);
      }
      nodeId = matches[0];

      // For prompt-like tags, allow user-friendly aliases (text <-> value).
      const node = apiPrompt[nodeId];
      const resolvedKey = resolveTagInputAlias(node, tag, key);
      overrides[nodeId] ||= {};
      overrides[nodeId][resolvedKey] = coerceValue(raw);
      continue;
    } else {
      // Node-id based (passthrough)
      nodeId = prefix;
    }

    overrides[nodeId] ||= {};
    overrides[nodeId][key] = coerceValue(raw);
  }

  return overrides;
}

/**
 * Randomize all seed fields in an API prompt.
 *
 * ComfyUI seeds are unsigned 64-bit integers (0 to 2^64 - 1).
 * JavaScript can safely represent integers up to 2^53 - 1 (Number.MAX_SAFE_INTEGER).
 * We use that range to avoid precision issues.
 *
 * Scans every node's inputs for supported seed keys with numeric values
 * and replaces them with a random value.
 *
 * Supported keys currently include: "seed" and "noise_seed".
 *
 * Skips keys that were explicitly set via overrides (pass appliedOverrides
 * to preserve user intent).
 *
 * Returns the list of randomized entries for logging.
 */
function randomizeSeeds(apiPrompt, appliedOverrides) {
  const randomized = [];
  const overriddenSeedKeys = new Set();
  const randomizableSeedKeys = ['seed', 'noise_seed'];

  // Build set of nodeId/key pairs that had seed explicitly overridden.
  if (appliedOverrides) {
    for (const entry of appliedOverrides) {
      if (randomizableSeedKeys.includes(entry.key)) {
        overriddenSeedKeys.add(`${entry.nodeId}:${entry.key}`);
      }
    }
  }

  for (const [nodeId, node] of Object.entries(apiPrompt)) {
    if (!node?.inputs || typeof node.inputs !== 'object') continue;
    for (const key of randomizableSeedKeys) {
      if (!(key in node.inputs)) continue;
      if (typeof node.inputs[key] !== 'number') continue;

      // Skip if user explicitly set this seed key via --set.
      if (overriddenSeedKeys.has(`${nodeId}:${key}`)) continue;

      const newSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      const oldSeed = node.inputs[key];
      node.inputs[key] = newSeed;
      randomized.push({
        nodeId,
        key,
        title: node._meta?.title || null,
        classType: node.class_type || null,
        oldSeed,
        newSeed,
      });
    }
  }

  return randomized;
}

function isEmptyImageValue(v) {
  return (
    v === null ||
    v === undefined ||
    (typeof v === 'string' && v.trim() === '')
  );
}

/**
 * Remove optional BFL image conversion chains when upstream LoadImage filename
 * is empty. This avoids runtime errors from ImageToBase64_BFL nodes that
 * require a concrete image.
 *
 * Behavior:
 * - Finds LoadImage nodes with empty `inputs.image`.
 * - Finds ImageToBase64_BFL nodes connected to those empty LoadImage nodes.
 * - Deletes those ImageToBase64_BFL nodes.
 * - Removes any links that reference the deleted converter nodes by deleting
 *   the corresponding input key on consumer nodes.
 * - Deletes now-unreferenced empty LoadImage nodes used only by the removed
 *   converters.
 */
function pruneOptionalBflImageInputs(apiPrompt) {
  const removedNodeIds = [];
  const disconnectedInputs = [];

  const emptyLoadImageIds = new Set();
  for (const [nodeId, node] of Object.entries(apiPrompt)) {
    if (node?.class_type !== 'LoadImage') continue;
    if (!isEmptyImageValue(node?.inputs?.image)) continue;
    emptyLoadImageIds.add(nodeId);
  }

  if (emptyLoadImageIds.size === 0) {
    return { apiPrompt, removedNodeIds, disconnectedInputs };
  }

  const bflConvertersToRemove = new Set();
  for (const [nodeId, node] of Object.entries(apiPrompt)) {
    if (node?.class_type !== 'ImageToBase64_BFL') continue;
    const imageInput = node?.inputs?.image;
    if (!Array.isArray(imageInput) || imageInput.length !== 2) continue;
    if (emptyLoadImageIds.has(String(imageInput[0]))) {
      bflConvertersToRemove.add(nodeId);
    }
  }

  if (bflConvertersToRemove.size === 0) {
    return { apiPrompt, removedNodeIds, disconnectedInputs };
  }

  // Disconnect any references to removed converter outputs.
  for (const [consumerId, consumer] of Object.entries(apiPrompt)) {
    if (!consumer?.inputs || typeof consumer.inputs !== 'object') continue;
    for (const [inputKey, inputVal] of Object.entries(consumer.inputs)) {
      if (!Array.isArray(inputVal) || inputVal.length !== 2) continue;
      if (!bflConvertersToRemove.has(String(inputVal[0]))) continue;

      delete consumer.inputs[inputKey];
      disconnectedInputs.push({
        nodeId: consumerId,
        key: inputKey,
        fromNodeId: String(inputVal[0]),
      });
    }
  }

  // Remove converters.
  for (const converterId of bflConvertersToRemove) {
    if (apiPrompt[converterId]) {
      delete apiPrompt[converterId];
      removedNodeIds.push(converterId);
    }
  }

  // Remove empty LoadImage nodes that are now unreferenced.
  const referencedNodeIds = new Set();
  for (const node of Object.values(apiPrompt)) {
    const inputs = node?.inputs;
    if (!inputs || typeof inputs !== 'object') continue;
    for (const value of Object.values(inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
        referencedNodeIds.add(value[0]);
      }
    }
  }

  for (const loadId of emptyLoadImageIds) {
    if (!apiPrompt[loadId]) continue;
    if (referencedNodeIds.has(loadId)) continue;
    delete apiPrompt[loadId];
    removedNodeIds.push(loadId);
  }

  return { apiPrompt, removedNodeIds, disconnectedInputs };
}

module.exports = {
  applyNodeInputOverrides,
  parseSetArgs,
  resolveTagOverrides,
  coerceValue,
  randomizeSeeds,
  pruneOptionalBflImageInputs,
};
