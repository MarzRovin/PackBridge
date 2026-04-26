const JSZip = require('jszip');

async function parseMrpack(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const indexFile = zip.file('modrinth.index.json');
  if (!indexFile) throw new Error('Invalid .mrpack: missing modrinth.index.json');

  const indexRaw = await indexFile.async('string');
  const index = JSON.parse(indexRaw);

  // Extract modloader info from dependencies
  const deps = index.dependencies || {};
  const mcVersion = deps['minecraft'] || null;

  let modloader = null;
  let modloaderVersion = null;

  for (const [key, val] of Object.entries(deps)) {
    if (key !== 'minecraft') {
      modloader = key; // fabric-loader, forge, quilt-loader, neoforge
      modloaderVersion = val;
      break;
    }
  }

  // Extract mods list
  const mods = (index.files || [])
    .filter(f => f.path.startsWith('mods/'))
    .map(f => {
      // Modrinth stores project/version IDs in env or hashes; we extract from downloads URL
      const modrinthUrl = (f.downloads || []).find(u => u.includes('cdn.modrinth.com') || u.includes('modrinth.com'));
      const cfUrl = (f.downloads || []).find(u => u.includes('curseforge.com') || u.includes('forgecdn.net'));

      let modrinthProjectId = null;
      let modrinthVersionId = null;
      if (modrinthUrl) {
        // https://cdn.modrinth.com/data/{projectId}/versions/{versionId}/filename
        const match = modrinthUrl.match(/\/data\/([^/]+)\/versions\/([^/]+)\//);
        if (match) {
          modrinthProjectId = match[1];
          modrinthVersionId = match[2];
        }
      }

      return {
        filename: path.basename(f.path),
        path: f.path,
        hashes: f.hashes || {},
        fileSize: f.fileSize,
        modrinthProjectId,
        modrinthVersionId,
        cfUrl,
        downloads: f.downloads || [],
        env: f.env || {}
      };
    });

  return {
    format: 'mrpack',
    name: index.name || 'Unknown Pack',
    version: index.versionId || '1.0.0',
    summary: index.summary || '',
    mcVersion,
    modloader: normalizeModloader(modloader),
    modloaderVersion,
    mods,
    rawIndex: index,
    rawZip: buffer.toString('base64') // carry overrides/config files
  };
}

function normalizeModloader(loader) {
  if (!loader) return null;
  if (loader.includes('fabric')) return 'fabric';
  if (loader.includes('quilt')) return 'quilt';
  if (loader.includes('neoforge')) return 'neoforge';
  if (loader.includes('forge')) return 'forge';
  return loader;
}

const path = require('path');
module.exports = { parseMrpack };
