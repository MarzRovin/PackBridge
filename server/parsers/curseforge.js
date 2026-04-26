const JSZip = require('jszip');

async function parseCurseForge(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid CurseForge ZIP: missing manifest.json');

  const manifest = JSON.parse(await manifestFile.async('string'));

  if (manifest.manifestType !== 'minecraftModpack') {
    throw new Error('Not a valid CurseForge modpack manifest');
  }

  const mcInfo = manifest.minecraft || {};
  const mcVersion = mcInfo.version || null;

  let modloader = null;
  let modloaderVersion = null;

  const loaders = mcInfo.modLoaders || [];
  const primaryLoader = loaders.find(l => l.primary) || loaders[0];
  if (primaryLoader) {
    // e.g. "forge-47.2.0" or "fabric-0.15.0"
    const parts = primaryLoader.id.split('-');
    modloader = normalizeModloader(parts[0]);
    modloaderVersion = parts.slice(1).join('-');
  }

  const mods = (manifest.files || []).map(f => ({
    filename: null, // CF ZIPs don't store filenames in manifest
    cfProjectId: f.projectID,
    cfFileId: f.fileID,
    required: f.required !== false,
    modrinthProjectId: null,
    modrinthVersionId: null,
    // Name resolved later via API
    displayName: `CF Project ${f.projectID}`
  }));

  return {
    format: 'curseforge',
    name: manifest.name || 'Unknown Pack',
    version: manifest.version || '1.0.0',
    author: manifest.author || '',
    mcVersion,
    modloader,
    modloaderVersion,
    mods,
    rawManifest: manifest
  };
}

function normalizeModloader(loader) {
  if (!loader) return null;
  const l = loader.toLowerCase();
  if (l.includes('fabric')) return 'fabric';
  if (l.includes('quilt')) return 'quilt';
  if (l.includes('neoforge')) return 'neoforge';
  if (l.includes('forge')) return 'forge';
  return l;
}

module.exports = { parseCurseForge };
