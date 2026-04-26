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

module.exports = { findCompatibleVersion, getProjectNames, lookupByHash };
