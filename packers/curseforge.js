const JSZip = require('jszip');

async function packCurseForge(parsedPack, resolvedMods, targetMcVersion, targetModloader, targetModloaderVersion) {
  const loaderId = modloaderCFId(targetModloader, targetModloaderVersion);

  const manifest = {
    minecraft: {
      version: targetMcVersion,
      modLoaders: loaderId ? [{ id: loaderId, primary: true }] : []
    },
    manifestType: 'minecraftModpack',
    manifestVersion: 1,
    name: parsedPack.name || 'Modpack',
    version: parsedPack.version || '1.0.0',
    author: parsedPack.author || '',
    files: resolvedMods.map(mod => {
      if (mod.platform === 'curseforge') {
        return { projectID: mod.projectId, fileID: mod.fileId, required: true };
      }
      // Modrinth mods can't be referenced by ID in CF format — they'll need to be in overrides
      return null;
    }).filter(Boolean),
    overrides: 'overrides'
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('modlist.html', generateModlistHtml(resolvedMods));

  const overrides = zip.folder('overrides');
  const mods = overrides.folder('mods');

  // Modrinth mods need their download URLs noted in a separate file since CF format
  // doesn't support external mod URLs natively
  const modrinthMods = resolvedMods.filter(m => m.platform === 'modrinth');
  if (modrinthMods.length > 0) {
    const note = modrinthMods.map(m =>
      `${m.displayName}: ${m.downloadUrl}`
    ).join('\n');
    overrides.file('MODRINTH_MODS_MANUAL_INSTALL.txt',
      `These mods were sourced from Modrinth and must be manually placed in your mods folder:\n\n${note}`
    );
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return buffer;
}

function modloaderCFId(modloader, version) {
  if (!modloader || !version) return null;
  return `${modloader}-${version}`;
}

function generateModlistHtml(mods) {
  const items = mods.map(m => `<li>${m.displayName} (${m.platform})</li>`).join('\n');
  return `<ul>\n${items}\n</ul>`;
}

module.exports = { packCurseForge };
