const fs = require('node:fs');
const path = require('node:path');

const UPLOAD_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
  ['.tif', 'image/tiff'],
  ['.tiff', 'image/tiff'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.flac', 'audio/flac'],
  ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/opus'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
]);

function supportedUploadExtensions() {
  return [...UPLOAD_TYPES.keys()].join(', ');
}

function parseRunArgs(argv, { baseDir }) {
  let outDir = path.join(baseDir, 'outputs');
  const setArgs = [];
  const fileArgs = [];
  let i = 0;

  if (argv[0] && !argv[0].startsWith('--')) {
    outDir = argv[0];
    i = 1;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--set') {
      if (!argv[i + 1]) throw new Error('Missing value for --set');
      setArgs.push(argv[++i]);
    } else if (arg === '--file') {
      if (!argv[i + 1]) throw new Error('Missing value for --file');
      fileArgs.push(argv[++i]);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown --run option: ${arg}`);
    } else {
      throw new Error(`Unexpected positional argument for --run: ${arg}`);
    }
  }

  return { outDir, setArgs, fileArgs };
}

function parseFileArg(arg) {
  const idxEq = arg.indexOf('=');
  if (idxEq === -1) throw new Error(`Invalid --file '${arg}'. Expected @tag.key=/path or nodeId.key=/path`);

  const left = arg.slice(0, idxEq);
  const localPath = arg.slice(idxEq + 1);
  if (!left.includes('.') || localPath === '') {
    throw new Error(`Invalid --file '${arg}'. Expected @tag.key=/path or nodeId.key=/path`);
  }

  return { left, localPath };
}

function getUploadContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = UPLOAD_TYPES.get(ext);
  if (!contentType) {
    throw new Error(`Unsupported --file extension "${ext || '(none)'}". Supported image/audio extensions: ${supportedUploadExtensions()}`);
  }
  return contentType;
}

function prepareUploadFile(arg) {
  const parsed = parseFileArg(arg);
  const resolvedPath = path.resolve(parsed.localPath);
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error(`--file path is not a file: ${parsed.localPath}`);

  return {
    ...parsed,
    localPath: resolvedPath,
    basename: path.basename(resolvedPath),
    contentType: getUploadContentType(resolvedPath),
  };
}

function uploadResponseToInputValue(response) {
  const name = response?.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`Invalid upload response from ComfyUI: ${JSON.stringify(response)}`);
  }

  if (typeof response.subfolder === 'string' && response.subfolder.length > 0) {
    return `${response.subfolder}/${name}`;
  }
  return name;
}

module.exports = {
  getUploadContentType,
  parseFileArg,
  parseRunArgs,
  prepareUploadFile,
  supportedUploadExtensions,
  uploadResponseToInputValue,
};
