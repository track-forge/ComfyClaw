const path = require('node:path');

const OUTPUT_KEYS = ['images', 'gifs', 'audio'];

function collectOutputDescriptors(output) {
  if (!output || typeof output !== 'object') return [];

  const descriptors = [];
  for (const key of OUTPUT_KEYS) {
    if (!(key in output)) continue;
    const values = output[key];
    if (!Array.isArray(values)) {
      throw new Error(`Malformed ComfyUI output: ${key} must be an array`);
    }

    values.forEach((descriptor, index) => {
      descriptors.push(normalizeDescriptor(descriptor, key, index));
    });
  }
  return descriptors;
}

function normalizeDescriptor(descriptor, key, index) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new Error(`Malformed ComfyUI output: ${key}[${index}] must be an object`);
  }

  const filename = descriptor.filename;
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new Error(`Malformed ComfyUI output: ${key}[${index}].filename must be a non-empty string`);
  }

  const subfolder = descriptor.subfolder ?? '';
  if (typeof subfolder !== 'string') {
    throw new Error(`Malformed ComfyUI output: ${key}[${index}].subfolder must be a string`);
  }

  const type = descriptor.type;
  if (typeof type !== 'string' || type.trim() === '') {
    throw new Error(`Malformed ComfyUI output: ${key}[${index}].type must be a non-empty string`);
  }

  return { ...descriptor, filename, subfolder, type, outputKey: key };
}

function safeBasename(filename) {
  return path.basename(path.win32.basename(filename));
}

function makeSafeLocalOutputPath(outDir, promptId, descriptor, seen = new Map()) {
  const baseName = safeBasename(descriptor.filename);
  if (!baseName || baseName === '.' || baseName === '..') {
    throw new Error(`Malformed ComfyUI output: invalid filename ${JSON.stringify(descriptor.filename)}`);
  }

  const prefixed = `${promptId}-${baseName}`;
  const parsed = path.parse(prefixed);
  const key = prefixed;
  const count = (seen.get(key) || 0) + 1;
  seen.set(key, count);

  const candidateName = count === 1
    ? prefixed
    : `${parsed.name}-${count}${parsed.ext}`;
  const resolvedOutDir = path.resolve(outDir);
  const resolvedPath = path.resolve(resolvedOutDir, candidateName);
  const relative = path.relative(resolvedOutDir, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside output directory: ${candidateName}`);
  }

  return resolvedPath;
}

module.exports = {
  collectOutputDescriptors,
  makeSafeLocalOutputPath,
};
