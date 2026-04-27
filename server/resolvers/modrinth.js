const https = require('https');

const BASE = 'https://api.modrinth.com/v2';
const HEADERS = { 'User-Agent': 'modpack-converter/1.0 (github.com/you/modpack-converter)' };

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

async function post(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
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
    req.write(body);
    req.end();
  });
}

// Bulk lookup project info by IDs to get human-readable names
async function getProjectNames(projectIds) {
  if (!projectIds.length) return {};
  const ids = projectIds.filter(Boolean);
  if (!ids.length) return {};
  const url = `${BASE}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`;
  const res = await get(url);
  const names = {};
  if (Array.isArray(res.body)) {
    for (const p of res.body) names[p.id] = p.title;
  }
  return names;
}

// Find compatible version for a project
async function findCompatibleVersion(projectId, mcVersion, modloader) {
  const loaderParam = modloader ? `&loaders=${encodeURIComponent(JSON.stringify([modloader]))}` : '';
  const url = `${BASE}/project/${projectId}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}${loaderParam}`;
  const res = await get(url);

  if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) {
    return null;
  }

  // Sort by date_published descending, pick latest
  const sorted = res.body.sort((a, b) => new Date(b.date_published) - new Date(a.date_published));
  return sorted[0];
}

// Lookup a mod by SHA1/SHA512 hash to find its Modrinth project ID
async function lookupByHash(hash, algorithm = 'sha1') {
  const url = `${BASE}/version_file/${hash}?algorithm=${algorithm}`;
  const res = await get(url);
  if (res.status === 200 && res.body.project_id) return res.body;
  return null;
}

// Strip loader-specific suffixes from mod names before searching
function cleanModName(name) {
  return name
    .replace(/\s*\[.*?\]/g, '')       // Remove [Fabric], [Forge], etc.
    .replace(/\s*\(.*?\)/g, '')       // Remove (Fabric), (Forge), etc.
    .replace(/\s+(fabric|forge|neoforge|quilt|refabricated|reforged)$/i, '')
    .replace(/^create:\s*/i, 'Create ')  // Normalize "Create: X" -> "Create X"
    .trim();
}

// Score how closely two strings match (0-1, higher = better)
function nameSimilarity(a, b) {
  a = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  b = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.8;
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return intersection / union;
}

// Search Modrinth for mods by name, filtered to a specific loader + MC version
async function searchByName(name, mcVersion, modloader) {
  const cleaned = cleanModName(name);
  if (!cleaned) return [];

  const facets = [
    [`versions:${mcVersion}`],
    [`categories:${modloader}`],
    ['project_type:mod']
  ];

  const url = `${BASE}/search?query=${encodeURIComponent(cleaned)}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=5`;
  const res = await get(url);

  if (res.status !== 200 || !res.body?.hits) return [];

  // Score and sort by name similarity, take top 3
  return res.body.hits
    .map(h => ({
      projectId: h.project_id,
      title: h.title,
      description: h.description,
      url: `https://modrinth.com/mod/${h.slug}`,
      _score: nameSimilarity(cleaned, h.title)
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
    .map(({ _score, ...s }) => s);
}

module.exports = { findCompatibleVersion, getProjectNames, lookupByHash, searchByName, cleanModName };
