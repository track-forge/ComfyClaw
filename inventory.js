// inventory.js
// Query ComfyUI servers for available models, LoRAs, VAEs, etc.
// Stores inventory + user-editable metadata in inventory/ directory.

const fs = require('node:fs');
const path = require('node:path');
const { getServerWithLowestQueue } = require('./helpers');

const BASE_DIR = process.env.COMFYCLAW_DIR || __dirname;
const INVENTORY_DIR = path.join(BASE_DIR, 'inventory');

// Asset types we query from ComfyUI /object_info
const ASSET_TYPES = {
  checkpoints: { classType: 'CheckpointLoaderSimple', inputKey: 'ckpt_name' },
  loras:       { classType: 'LoraLoader',             inputKey: 'lora_name' },
  vaes:        { classType: 'VAELoader',               inputKey: 'vae_name' },
  upscalers:   { classType: 'UpscaleModelLoader',      inputKey: 'model_name' },
  samplers:    { classType: 'KSampler',                inputKey: 'sampler_name' },
  schedulers:  { classType: 'KSampler',                inputKey: 'scheduler' },
};

/**
 * Fetch the list of available values for an asset type from a ComfyUI server.
 */
async function fetchAssetList(serverURL, classType, inputKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `${serverURL}/object_info/${encodeURIComponent(classType)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const nodeInfo = data?.[classType];
    if (!nodeInfo) return [];
    const allInputs = { ...(nodeInfo.input?.required || {}), ...(nodeInfo.input?.optional || {}) };
    const entry = allInputs[inputKey];
    if (Array.isArray(entry) && Array.isArray(entry[0])) return entry[0];
    return [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(`Failed to fetch ${classType}.${inputKey}: ${err.message}`);
  }
}

/**
 * Get the server URL (env override or auto-select).
 */
async function getServerURL() {
  const envServer = process.env.COMFYUI_SERVER;
  if (envServer) return envServer;
  try {
    const res = await getServerWithLowestQueue();
    if (!res.allServersDown && res.serverToUse) return res.serverToUse;
  } catch { /* ignore */ }
  return null;
}

/**
 * Pull full inventory from a ComfyUI server.
 * Returns { checkpoints: [...], loras: [...], vaes: [...], ... }
 */
async function pullInventory(serverURL) {
  const inventory = {};
  for (const [type, { classType, inputKey }] of Object.entries(ASSET_TYPES)) {
    inventory[type] = await fetchAssetList(serverURL, classType, inputKey);
  }
  return inventory;
}

// ── Inventory File I/O ───────────────────────────────────────────────────

function ensureInventoryDir() {
  fs.mkdirSync(INVENTORY_DIR, { recursive: true });
}

function inventoryPath() {
  return path.join(INVENTORY_DIR, 'inventory.json');
}

function metadataPath(type) {
  return path.join(INVENTORY_DIR, `${type}.meta.json`);
}

/**
 * Load the stored inventory (raw list of available assets per type).
 */
function loadInventory() {
  const p = inventoryPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Save inventory to disk.
 */
function saveInventory(inventory) {
  ensureInventoryDir();
  const data = {
    pulled_at: new Date().toISOString(),
    server: inventory._server || null,
    assets: {},
  };
  for (const [type, items] of Object.entries(inventory)) {
    if (type.startsWith('_')) continue;
    data.assets[type] = items;
  }
  fs.writeFileSync(inventoryPath(), JSON.stringify(data, null, 2));
  return data;
}

/**
 * Load metadata for an asset type (e.g. "loras", "checkpoints").
 * Returns a map of { filename: { description, tags, ... } }
 */
function loadMetadata(type) {
  const p = metadataPath(type);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Save metadata for an asset type.
 */
function saveMetadata(type, metadata) {
  ensureInventoryDir();
  fs.writeFileSync(metadataPath(type), JSON.stringify(metadata, null, 2));
}

/**
 * Set metadata for a specific asset within a type.
 * Merges with existing metadata (does not overwrite other fields).
 */
function setAssetMetadata(type, filename, fields) {
  const meta = loadMetadata(type);
  meta[filename] = { ...(meta[filename] || {}), ...fields };
  saveMetadata(type, meta);
  return meta[filename];
}

/**
 * Get metadata for a specific asset.
 */
function getAssetMetadata(type, filename) {
  const meta = loadMetadata(type);
  return meta[filename] || null;
}

/**
 * Initialize metadata files for all asset types from inventory.
 * Only adds entries that don't already exist (preserves user edits).
 */
function initMetadataFromInventory(inventory) {
  ensureInventoryDir();
  const assets = inventory.assets || inventory;

  for (const [type, items] of Object.entries(assets)) {
    if (type.startsWith('_') || !Array.isArray(items)) continue;
    const existing = loadMetadata(type);
    let added = 0;

    for (const item of items) {
      if (!existing[item]) {
        existing[item] = {
          description: '',
          tags: [],
          notes: '',
        };
        added++;
      }
    }

    if (added > 0) {
      saveMetadata(type, existing);
    }
  }
}

module.exports = {
  ASSET_TYPES,
  INVENTORY_DIR,
  pullInventory,
  getServerURL,
  loadInventory,
  saveInventory,
  loadMetadata,
  saveMetadata,
  setAssetMetadata,
  getAssetMetadata,
  initMetadataFromInventory,
};
