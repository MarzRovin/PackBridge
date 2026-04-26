const https = require('https');

const BASE = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;

// Modloader type IDs in CF API
const MODLOADER_IDS = {
  forge: 1,
  cauldron: 2,
  liteloader: 3,
  fabric: 4,
  quilt: 5,
  neoforge: 6
};

function request(method, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.curseforge.com',
      path: `/v1${path}`,
      method,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Get mod info (name, slug, etc.)
async function getMod(projectId, apiKey) {
  const res = await request('GET', `/mods/${projectId}`, apiKey);
  if (res.status === 200 && res.body.data) return res.body.data;
  return null;
}

// Bulk get mod names
async function getModNames(projectIds, apiKey) {
  if (!projectIds.length || !apiKey) return {};
  const res = await request('POST', '/mods', apiKey, { modIds: projectIds });
  const names = {};
  if (res.body && Array.isArray(res.body.data)) {
    for (const mod of res.body.data) names[mod.id] = mod.name;
  }
  return names;
}

// Find compatible file for a CF mod
async function findCompatibleFile(projectId, mcVersion, modloader, apiKey) {
  const modloaderType = MODLOADER_IDS[modloader] || 0;
  const params = new URLSearchParams({
    gameVersion: mcVersion,
    modLoaderType: modloaderType,
    pageSize: 10
  });
  const res = await request('GET', `/mods/${projectId}/files?${params}`, apiKey);

  if (res.status !== 200 || !res.body.data || res.body.data.length === 0) return null;

  // Sort by fileDate descending
  const sorted = res.body.data.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate));
  return sorted[0];
}

module.exports = { getMod, getModNames, findCompatibleFile };
