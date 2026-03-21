#!/usr/bin/env node
// cli.js
// Unified CLI for ComfyUI workflow discovery, inspection, and execution.
//
// Usage:
//   node cli.js --list
//   node cli.js --describe <workflow>
//   node cli.js --metadata <workflow>
//   node cli.js --run <workflow> [outDir] [--set @tag.key=value ...]

const fs = require('node:fs');
const path = require('node:path');

const { listWorkflows, loadWorkflow, loadWorkflowMetadata } = require('./workflows');
const {
    applyNodeInputOverrides,
    resolveTagOverrides,
    randomizeSeeds,
    pruneOptionalBflImageInputs,
} = require('./patch');
const { getServerWithLowestQueue } = require('./helpers');
const ComfyUI = require('./comfy');
const config = require('./config');
const inventory = require('./inventory');

// ── Optional S3 Upload ──────────────────────────────────────────────────────

let s3Client = null;
let PutObjectCommand = null;

function getS3() {
    if (!config.aws?.enabled) return null;
    if (s3Client) return { s3Client, PutObjectCommand };

    try {
        const s3sdk = require('@aws-sdk/client-s3');
        PutObjectCommand = s3sdk.PutObjectCommand;

        // Build S3 client options — if explicit creds are set, use them;
        // otherwise fall back to the default chain (~/.aws/credentials, env vars, instance role)
        const opts = { region: config.aws.region || 'us-east-1' };
        if (config.aws.accessKeyId && config.aws.secretAccessKey) {
            opts.credentials = {
                accessKeyId: config.aws.accessKeyId,
                secretAccessKey: config.aws.secretAccessKey,
            };
        }

        s3Client = new s3sdk.S3Client(opts);
        return { s3Client, PutObjectCommand };
    } catch {
        console.warn('Warning: @aws-sdk/client-s3 not installed. S3 upload disabled.');
        console.warn('  Install with: npm install @aws-sdk/client-s3');
        config.aws.enabled = false;
        return null;
    }
}

async function uploadToS3(filePath, buf) {
    const s3 = getS3();
    if (!s3) return null;

    const ext = path.extname(filePath).slice(1);
    const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', gif: 'image/gif' };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const key = `${config.aws.prefix || ''}${path.basename(filePath)}`;

    try {
        const cmd = new s3.PutObjectCommand({
            Bucket: config.aws.bucket,
            Key: key,
            Body: buf,
            ContentType: contentType,
        });

        await s3.s3Client.send(cmd);
        console.log(`  Uploaded to S3: s3://${config.aws.bucket}/${key}`);
        return key;
    } catch (err) {
        console.error(`  S3 upload failed: ${err.message}`);
        return null;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isScalar(v) {
    return (
        v === null ||
        v === undefined ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
    );
}

function summarizeNode(nodeId, node) {
    const title = node?._meta?.title;
    const classType = node?.class_type;
    const inputs = node?.inputs || {};

    const scalar = [];
    const linked = [];

    for (const [k, v] of Object.entries(inputs)) {
        if (Array.isArray(v)) linked.push(k);
        else if (isScalar(v)) scalar.push({ key: k, value: v });
    }

    return { nodeId, title, classType, scalar, linked };
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdList() {
    const workflows = listWorkflows();
    if (workflows.length === 0) {
        console.log('No workflows found in workflows/ directory.');
        console.log('Place *-api.json files in the workflows/ folder.');
        process.exit(0);
    }

    console.log('Available workflows:\n');
    for (const wf of workflows) {
        console.log(`  ${wf.name}`);
    }
    console.log(`\nTotal: ${workflows.length} workflow(s)`);
    console.log('\nUsage:');
    console.log('  node cli.js --describe <name>   Show editable parameters');
    console.log('  node cli.js --metadata <name>   Print workflow metadata JSON');
    console.log('  node cli.js --run <name>        Execute a workflow');
}

/**
 * Query ComfyUI server /object_info/<class_type> for a node's input schema.
 * Returns a map of { inputName: string[] | null } for enum-type inputs.
 */
async function fetchNodeInputInfo(serverURL, classType) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${serverURL}/object_info/${encodeURIComponent(classType)}`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) return {};

        const data = await res.json();
        const nodeInfo = data?.[classType];
        if (!nodeInfo) return {};

        const result = {};
        const allInputs = { ...(nodeInfo.input?.required || {}), ...(nodeInfo.input?.optional || {}) };

        for (const [k, v] of Object.entries(allInputs)) {
            if (Array.isArray(v) && Array.isArray(v[0])) {
                // Enum-type: v[0] is the list of valid values
                result[k] = v[0];
            }
        }
        return result;
    } catch {
        return {};
    }
}

async function getServerURL() {
    const envServer = process.env.COMFYUI_SERVER;
    if (envServer) return envServer;

    try {
        const res = await getServerWithLowestQueue();
        if (!res.allServersDown && res.serverToUse) return res.serverToUse;
    } catch { /* ignore */ }
    return null;
}

function cmdMetadata(name) {
    if (!name) {
        console.error('Error: --metadata requires a workflow name.');
        console.error('Usage: node cli.js --metadata <workflow>');
        console.error('Run "node cli.js --list" to see available workflows.');
        process.exit(2);
    }

    const result = loadWorkflowMetadata(name);
    if (!result) {
        console.error(`No metadata file found for workflow "${name}".`);
        console.error('Looked for both *.metadata.json and *.meta.json companion files.');
        process.exit(1);
    }

    console.log(JSON.stringify(result.data, null, 2));
}

async function cmdDescribe(name) {
    if (!name) {
        console.error('Error: --describe requires a workflow name.');
        console.error('Usage: node cli.js --describe <workflow>');
        console.error('Run "node cli.js --list" to see available workflows.');
        process.exit(2);
    }

    const { prompt } = loadWorkflow(name);

    // Find all @tagged nodes
    const tagged = [];
    for (const [nodeId, node] of Object.entries(prompt)) {
        const title = node?._meta?.title;
        if (typeof title === 'string' && title.startsWith('@')) {
            tagged.push(summarizeNode(nodeId, node));
        }
    }

    tagged.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (tagged.length === 0) {
        console.log(`Workflow "${name}" has no @tags.`);
        console.log('Add _meta.title = "@tagname" to nodes you want to be editable.');
        return;
    }

    // Try to reach the server for enum value lookups
    const serverURL = await getServerURL();
    const enumCache = {};

    if (serverURL) {
        // Fetch object_info for each unique class_type
        const classTypes = [...new Set(tagged.map((t) => t.classType))];
        await Promise.all(
            classTypes.map(async (ct) => {
                enumCache[ct] = await fetchNodeInputInfo(serverURL, ct);
            }),
        );
    }

    console.log(`Workflow: ${name}`);
    console.log(`Tags: ${tagged.length}`);
    if (serverURL) console.log(`Server: ${serverURL}`);
    console.log('');

    for (const n of tagged) {
        console.log(`${n.title}  (node ${n.nodeId}, ${n.classType})`);
        const nodeEnums = enumCache[n.classType] || {};

        if (n.scalar.length) {
            console.log('  editable:');
            for (const { key, value } of n.scalar) {
                const display = typeof value === 'string'
                    ? (value.length > 60 ? `"${value.slice(0, 57)}..."` : `"${value}"`)
                    : JSON.stringify(value);
                console.log(`    --set ${n.title}.${key}=${display}`);

                // Show available enum values from server
                if (nodeEnums[key]) {
                    const vals = nodeEnums[key];
                    const marked = vals.map((v) => {
                        const current = String(value) === String(v);
                        return current ? `★ ${v}` : `  ${v}`;
                    });
                    console.log(`      values (${vals.length}):`);
                    for (const m of marked) {
                        console.log(`        ${m}`);
                    }
                }
            }
        } else {
            console.log('  editable: (none)');
        }

        if (n.linked.length) {
            console.log(`  linked (do NOT override): ${n.linked.join(', ')}`);
        }

        console.log('');
    }

    console.log('Example:');
    // Build a concrete example from the first tag with scalar inputs
    const example = tagged.find((t) => t.scalar.length > 0);
    if (example) {
        const s = example.scalar[0];
        const val = typeof s.value === 'string' ? '"your value here"' : s.value;
        console.log(`  node cli.js --run ${name} outputs --set ${example.title}.${s.key}=${val}`);
    } else {
        console.log(`  node cli.js --run ${name} outputs`);
    }
}

async function cmdRun(name, argv) {
    if (!name) {
        console.error('Error: --run requires a workflow name.');
        console.error('Usage: node cli.js --run <workflow> [outDir] [--set @tag.key=value ...]');
        console.error('Run "node cli.js --list" to see available workflows.');
        process.exit(2);
    }

    // Parse remaining argv: [outDir] [--set key=val ...]
    const baseDir = process.env.COMFYCLAW_DIR || __dirname;
    let outDir = path.join(baseDir, 'outputs');
    const setArgs = [];
    let i = 0;

    // First non-flag arg after name is outDir
    if (argv[0] && !argv[0].startsWith('--')) {
        outDir = argv[0];
        i = 1;
    }

    for (; i < argv.length; i++) {
        if (argv[i] === '--set') {
            if (!argv[i + 1]) throw new Error('Missing value for --set');
            setArgs.push(argv[i + 1]);
            i++;
        }
    }

    fs.mkdirSync(outDir, { recursive: true });

    const { prompt: apiPrompt } = loadWorkflow(name);

    // Resolve tag-based + node-id overrides
    const overrides = resolveTagOverrides(apiPrompt, setArgs);
    const { applied, skipped } = applyNodeInputOverrides(apiPrompt, overrides);

    if (applied.length) {
        console.log('Applied overrides:');
        applied.forEach((o) => console.log(`  - node ${o.nodeId}: ${o.key} = ${JSON.stringify(o.value)}`));
    }
    if (skipped.length) {
        console.log('Skipped overrides:');
        skipped.forEach((o) => console.log(`  - node ${o.nodeId}${o.key ? '.' + o.key : ''}: ${o.reason}`));
    }

    // Prune optional BFL image conversion chains when image filename is blank.
    const { removedNodeIds, disconnectedInputs } = pruneOptionalBflImageInputs(apiPrompt);
    if (disconnectedInputs.length || removedNodeIds.length) {
        console.log('Pruned optional empty BFL image inputs:');
        disconnectedInputs.forEach((d) => {
            console.log(`  - node ${d.nodeId}: removed input ${d.key} (from node ${d.fromNodeId})`);
        });
        removedNodeIds.forEach((nodeId) => {
            console.log(`  - removed node ${nodeId}`);
        });
    }

    // Randomize seeds (skips any seeds explicitly set via --set)
    const randomized = randomizeSeeds(apiPrompt, applied);
    if (randomized.length) {
        console.log('Randomized seeds:');
        randomized.forEach((r) => {
            const label = r.title || r.classType || `node ${r.nodeId}`;
            console.log(`  - ${label} (node ${r.nodeId}): ${r.newSeed}`);
        });
    }

    // Server selection
    const envServer = process.env.COMFYUI_SERVER;
    let serverToUse = envServer || null;

    if (!serverToUse) {
        const res = await getServerWithLowestQueue();
        if (res.allServersDown || !res.serverToUse) {
            throw new Error('All ComfyUI servers unavailable (see logs above).');
        }
        serverToUse = res.serverToUse;
    }

    // Detect save nodes
    const saveNodes = Object.keys(apiPrompt).filter(
        (k) => apiPrompt[k]?._meta?.title === 'Save'
            || apiPrompt[k]?._meta?.title === '@save'
            || apiPrompt[k]?._meta?.title === 'SaveVideo'
            || apiPrompt[k]?.class_type === 'SaveImage'
            || apiPrompt[k]?.class_type === 'SaveAudio'
            || apiPrompt[k]?.class_type === 'VHS_VideoCombine',
    );

    if (saveNodes.length === 0) {
        throw new Error('No Save node detected in workflow. Tag your output node as @save or use SaveImage class.');
    }

    let finished = false;
    const downloaded = [];
    let comfy = null;
    let timeoutId = null;

    await new Promise((resolve, reject) => {
        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;
            if (comfy) comfy.disconnect();
            comfy = null;
        };

        const resolveDone = () => {
            finished = true;
            cleanup();
            resolve();
        };

        const rejectDone = (err) => {
            finished = true;
            cleanup();
            reject(err);
        };

        comfy = new ComfyUI({
            comfyUIServerURL: serverToUse,
            nodes: { api_save: saveNodes },

            onSaveCallback: async ({ message, promptId }) => {
                try {
                    // TODO: SaveAudio Handler
                    const files = (message?.data?.output?.images || []).concat(message?.data?.output?.gifs || []);
                    for (const file of files) {
                        const buf = await comfy.getFile(file);
                        const outPath = path.join(outDir, `${promptId}-${file.filename}`);
                        fs.writeFileSync(outPath, buf);
                        downloaded.push(outPath);
                        console.log(`Saved: ${outPath} (${buf.length} bytes)`);

                        // Optional S3 upload
                        if (config.aws?.enabled) {
                            await uploadToS3(outPath, buf);
                        }
                    }
                } catch (e) {
                    rejectDone(e);
                }
            },

            onMessageCallback: async ({ message }) => {
                if (message?.type === 'execution_error') {
                    rejectDone(new Error(message?.data?.exception_message || 'Execution error'));
                }
                if (message?.type === 'execution_success') {
                    resolveDone();
                }
            },

            onOpenCallback: async (self) => {
                try {
                    await self.queue({ workflowDataAPI: apiPrompt });
                } catch (e) {
                    rejectDone(e);
                }
            },

            onErrorCallback: async (err) => {
                rejectDone(err);
            },
        });

        // Safety timeout
        timeoutId = setTimeout(() => {
            if (!finished) {
                rejectDone(new Error('Timed out waiting for workflow to finish.'));
            }
        }, Number(process.env.COMFYUI_TIMEOUT_MS || 180000));
    });

    console.log('\nDone. Outputs:');
    downloaded.forEach((p) => console.log(`  - ${p}`));
}

// ── Inventory Commands ───────────────────────────────────────────────────────

async function cmdInventoryPull() {
    const serverURL = await inventory.getServerURL();
    if (!serverURL) {
        console.error('No ComfyUI server available. Set COMFYUI_SERVER or configure servers in config.js.');
        process.exit(1);
    }

    console.log(`Pulling inventory from ${serverURL}...`);
    const inv = await inventory.pullInventory(serverURL);
    inv._server = serverURL;
    const saved = inventory.saveInventory(inv);

    // Init metadata stubs for new assets
    inventory.initMetadataFromInventory(saved);

    console.log('\nInventory:');
    for (const [type, items] of Object.entries(saved.assets)) {
        console.log(`  ${type}: ${items.length} item(s)`);
    }
    console.log(`\nSaved to: ${inventory.INVENTORY_DIR}/`);
    console.log('Metadata files initialized (existing entries preserved).');
}

function cmdInventoryList(type) {
    const inv = inventory.loadInventory();
    if (!inv) {
        console.error('No inventory found. Run: node cli.js --inventory pull');
        process.exit(1);
    }

    const validTypes = Object.keys(inv.assets);

    if (!type) {
        // Show summary
        console.log(`Inventory (pulled: ${inv.pulled_at})`);
        if (inv.server) console.log(`Server: ${inv.server}`);
        console.log('');
        for (const [t, items] of Object.entries(inv.assets)) {
            console.log(`  ${t}: ${items.length}`);
        }
        console.log(`\nUse: node cli.js --inventory list <type>`);
        console.log(`Types: ${validTypes.join(', ')}`);
        return;
    }

    if (!inv.assets[type]) {
        console.error(`Unknown asset type: "${type}"`);
        console.error(`Valid types: ${validTypes.join(', ')}`);
        process.exit(1);
    }

    const items = inv.assets[type];
    const meta = inventory.loadMetadata(type);

    console.log(`${type} (${items.length}):\n`);
    for (const item of items) {
        const m = meta[item];
        const desc = m?.description ? ` — ${m.description}` : '';
        const tags = m?.tags?.length ? ` [${m.tags.join(', ')}]` : '';
        console.log(`  ${item}${desc}${tags}`);
    }
}

function cmdInventoryInfo(type, name) {
    if (!type || !name) {
        console.error('Usage: node cli.js --inventory info <type> <name>');
        console.error('Example: node cli.js --inventory info loras gildedvictoriansxl_v2-000005.safetensors');
        process.exit(2);
    }

    const meta = inventory.getAssetMetadata(type, name);
    if (!meta) {
        console.log(`No metadata for ${type}/${name}.`);
        console.log('Run --inventory pull first, then --inventory set to add metadata.');
        return;
    }

    console.log(`${type}: ${name}\n`);
    console.log(JSON.stringify(meta, null, 2));
}

function cmdInventorySet(type, name, kvPairs) {
    if (!type || !name || kvPairs.length === 0) {
        console.error('Usage: node cli.js --inventory set <type> <name> key=value [key=value ...]');
        console.error('Example: node cli.js --inventory set loras gildedvictoriansxl_v2-000005.safetensors description="Victorian era LoRA" tags=victorian,photorealistic,1880s');
        process.exit(2);
    }

    const fields = {};
    for (const kv of kvPairs) {
        const eqIdx = kv.indexOf('=');
        if (eqIdx === -1) {
            console.error(`Invalid key=value pair: "${kv}"`);
            process.exit(2);
        }
        const key = kv.slice(0, eqIdx);
        let value = kv.slice(eqIdx + 1);

        // Parse tags as array
        if (key === 'tags') {
            value = value.split(',').map((t) => t.trim()).filter(Boolean);
        }

        fields[key] = value;
    }

    const result = inventory.setAssetMetadata(type, name, fields);
    console.log(`Updated ${type}/${name}:`);
    console.log(JSON.stringify(result, null, 2));
}

async function cmdInventory(argv) {
    const sub = argv[0];

    if (!sub || sub === 'help') {
        console.log('Inventory — Manage available models, LoRAs, VAEs, and more.\n');
        console.log('Usage:');
        console.log('  node cli.js --inventory pull                          Fetch inventory from server');
        console.log('  node cli.js --inventory list [type]                   List assets (summary or by type)');
        console.log('  node cli.js --inventory info <type> <name>            Show metadata for an asset');
        console.log('  node cli.js --inventory set <type> <name> key=val     Set metadata fields\n');
        console.log('Types: checkpoints, loras, vaes, upscalers, samplers, schedulers');
        console.log('\nExamples:');
        console.log('  node cli.js --inventory pull');
        console.log('  node cli.js --inventory list loras');
        console.log('  node cli.js --inventory set loras gildedvictoriansxl_v2-000005.safetensors \\');
        console.log('    description="Victorian era photography" tags=victorian,photorealistic,1880s');
        return;
    }

    if (sub === 'pull') {
        await cmdInventoryPull();
    } else if (sub === 'list') {
        cmdInventoryList(argv[1]);
    } else if (sub === 'info') {
        cmdInventoryInfo(argv[1], argv[2]);
    } else if (sub === 'set') {
        cmdInventorySet(argv[1], argv[2], argv.slice(3));
    } else {
        console.error(`Unknown inventory subcommand: "${sub}"`);
        console.error('Run: node cli.js --inventory help');
        process.exit(2);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function printUsage() {
    console.log('ComfyUI CLI — Discover, inspect, and run ComfyUI workflows.\n');
    console.log('Usage:');
    console.log('  node cli.js --list                              List available workflows');
    console.log('  node cli.js --describe <workflow>               Show editable @tag parameters');
    console.log('  node cli.js --metadata <workflow>               Print workflow metadata JSON');
    console.log('  node cli.js --run <workflow> [outDir] [--set]   Run a workflow');
    console.log('  node cli.js --inventory <subcommand>            Manage models, LoRAs, VAEs\n');
    console.log('Override parameters:');
    console.log('  --set @tag.key=value     Tag-based override (recommended)');
    console.log('  --set nodeId.key=value   Direct node-ID override\n');
    console.log('Inventory subcommands:');
    console.log('  pull                     Fetch available assets from ComfyUI server');
    console.log('  list [type]              List assets (summary or by type)');
    console.log('  info <type> <name>       Show metadata for a specific asset');
    console.log('  set <type> <name> k=v    Update metadata for an asset\n');
    console.log('Environment:');
    console.log('  COMFYCLAW_DIR        ComfyClaw repo directory (default: script location)');
    console.log('  COMFYUI_SERVER       Force a specific server URL');
    console.log('  COMFYUI_TIMEOUT_MS   Max wait time (default: 180000)');
}

async function main() {
    const argv = process.argv.slice(2);

    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
        printUsage();
        process.exit(argv.length === 0 ? 2 : 0);
    }

    const command = argv[0];

    if (command === '--list') {
        cmdList();
    } else if (command === '--describe') {
        await cmdDescribe(argv[1]);
    } else if (command === '--metadata') {
        cmdMetadata(argv[1]);
    } else if (command === '--run') {
        await cmdRun(argv[1], argv.slice(2));
    } else if (command === '--inventory') {
        await cmdInventory(argv.slice(1));
    } else {
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(2);
    }
}

main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});
