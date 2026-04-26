const modrinth = require('./modrinth');
const curseforge = require('./curseforge');

/**
 * Resolve all mods to versions compatible with the target MC version + modloader.
 * Returns { resolved: [...], failed: [...] }
 *
 * failed entries always include:
 *   - displayName (human-readable mod name, never just an ID)
 *   - reason (why it failed)
 *   - platform
 *   - original mod info
 */
async function resolveMods(mods, targetMcVersion, targetModloader, targetModloaderVersion, cfApiKey) {
  // Step 1: Enrich mod display names before we do anything else
  const modrinthIds = mods.map(m => m.modrinthProjectId).filter(Boolean);
  const cfIds = mods.map(m => m.cfProjectId).filter(id => id != null);

  const [modrinthNames, cfNames] = await Promise.all([
    modrinth.getProjectNames(modrinthIds),
    cfApiKey && cfIds.length ? curseforge.getModNames(cfIds, cfApiKey) : Promise.resolve({})
  ]);

  // Attach display names to mods
  const enriched = mods.map(mod => ({
    ...mod,
    displayName:
      mod.displayName && !mod.displayName.startsWith('CF Project') ? mod.displayName
      : modrinthNames[mod.modrinthProjectId]
      || cfNames[mod.cfProjectId]
      || mod.filename
      || (mod.modrinthProjectId ? `Modrinth:${mod.modrinthProjectId}` : null)
      || (mod.cfProjectId ? `CurseForge:${mod.cfProjectId}` : null)
      || 'Unknown Mod'
  }));

  // Step 2: Resolve each mod concurrently (with a concurrency limit)
  const CONCURRENCY = 10;
  const resolved = [];
  const failed = [];

  async function resolveOne(mod) {
    // Try Modrinth first if we have a project ID
    if (mod.modrinthProjectId) {
      try {
        const version = await modrinth.findCompatibleVersion(mod.modrinthProjectId, targetMcVersion, targetModloader);
        if (version) {
          return {
            status: 'resolved',
            platform: 'modrinth',
            displayName: mod.displayName,
            projectId: mod.modrinthProjectId,
            versionId: version.id,
            versionName: version.name,
            filename: version.files?.[0]?.filename || '',
            downloadUrl: version.files?.[0]?.url || '',
            hashes: version.files?.[0]?.hashes || {},
            fileSize: version.files?.[0]?.size || 0,
            env: mod.env || {},
            original: mod
          };
        }
      } catch (err) {
        // Fall through to CF attempt
      }
    }

    // Try CurseForge if we have a project ID and API key
    if (mod.cfProjectId && cfApiKey) {
      try {
        const file = await curseforge.findCompatibleFile(mod.cfProjectId, targetMcVersion, targetModloader, cfApiKey);
        if (file) {
          return {
            status: 'resolved',
            platform: 'curseforge',
            displayName: mod.displayName,
            projectId: mod.cfProjectId,
            fileId: file.id,
            filename: file.fileName,
            downloadUrl: file.downloadUrl,
            fileSize: file.fileLength || 0,
            original: mod
          };
        }
      } catch (err) {
        // Fall through to failure
      }
    }

    // If we have a hash but no project ID, try Modrinth hash lookup
    if (!mod.modrinthProjectId && mod.hashes?.sha1) {
      try {
        const found = await modrinth.lookupByHash(mod.hashes.sha1, 'sha1');
        if (found?.project_id) {
          const version = await modrinth.findCompatibleVersion(found.project_id, targetMcVersion, targetModloader);
          if (version) {
            return {
              status: 'resolved',
              platform: 'modrinth',
              displayName: mod.displayName,
              projectId: found.project_id,
              versionId: version.id,
              versionName: version.name,
              filename: version.files?.[0]?.filename || '',
              downloadUrl: version.files?.[0]?.url || '',
              hashes: version.files?.[0]?.hashes || {},
              fileSize: version.files?.[0]?.size || 0,
              env: mod.env || {},
              original: mod
            };
          }
        }
      } catch {}
    }

    // Determine a clear failure reason
    let reason;
    if (!mod.modrinthProjectId && !mod.cfProjectId) {
      reason = 'No platform ID found — mod may have been added manually or sourced from an unsupported platform';
    } else {
      const platforms = [
        mod.modrinthProjectId ? 'Modrinth' : null,
        mod.cfProjectId && cfApiKey ? 'CurseForge' : null,
        mod.cfProjectId && !cfApiKey ? 'CurseForge (no API key provided)' : null
      ].filter(Boolean).join(', ');
      reason = `No version found for Minecraft ${targetMcVersion} + ${targetModloader} on ${platforms}`;
    }

    return {
      status: 'failed',
      displayName: mod.displayName,
      reason,
      modrinthProjectId: mod.modrinthProjectId || null,
      cfProjectId: mod.cfProjectId || null,
      original: mod
    };
  }

  // Run with concurrency limit
  for (let i = 0; i < enriched.length; i += CONCURRENCY) {
    const batch = enriched.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(resolveOne));
    for (const r of results) {
      if (r.status === 'resolved') resolved.push(r);
      else failed.push(r);
    }
  }

  return { resolved, failed };
}

module.exports = { resolveMods };
