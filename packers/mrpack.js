const JSZip = require('jszip');

async function packMrpack(parsedPack, resolvedMods, targetMcVersion, targetModloader, targetModloaderVersion) {
  const loaderKey = loaderDependencyKey(targetModloader);

  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: parsedPack.version || '1.0.0',
    name: parsedPack.name || 'Modpack',
    summary: parsedPack.summary || '',
    files: resolvedMods.map(mod => ({
      path: `mods/${mod.filename}`,
      hashes: mod.hashes || {},
      env: mod.env || { client: 'required', server: 'required' },
      downloads: [mod.downloadUrl],
      fileSize: mod.fileSize || 0
    })),
    dependencies: {
      minecraft: targetMcVersion,
      ...(loaderKey && targetModloaderVersion ? { [loaderKey]: targetModloaderVersion } : {})
    }
  };

  const zip = new JSZip();
  zip.file('modrinth.index.json', JSON.stringify(index, null, 2));

  // Re-include overrides from original pack if available
  if (parsedPack.rawZip) {
    try {
      const originalZip = await JSZip.loadAsync(Buffer.from(parsedPack.rawZip, 'base64'));
      originalZip.forEach((relativePath, file) => {
        if (relativePath.startsWith('overrides/') && !file.dir) {
          zip.file(relativePath, file.async('arraybuffer'));
        }
      });
    } catch {}
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return buffer;
}

function loaderDependencyKey(modloader) {
  switch (modloader) {
    case 'fabric': return 'fabric-loader';
    case 'quilt': return 'quilt-loader';
    case 'forge': return 'forge';
    case 'neoforge': return 'neoforge';
    default: return modloader;
  }
}

module.exports = { packMrpack };
