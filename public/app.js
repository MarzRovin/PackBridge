const API = '';

let parsedPack = null;
let resolvedMods = [];
let failedMods = [];

// ─── DOM refs ───────────────────────────────────────────────────────────────
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const packInfo = document.getElementById('pack-info');
const stepConfig = document.getElementById('step-config');
const stepResults = document.getElementById('step-results');

// ─── Dropzone ────────────────────────────────────────────────────────────────
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));

dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleUpload(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleUpload(fileInput.files[0]);
});

async function handleUpload(file) {
  const allowed = file.name.endsWith('.mrpack') || file.name.endsWith('.zip');
  if (!allowed) {
    showToast('Upload a .mrpack or CurseForge .zip file');
    return;
  }

  dropzone.querySelector('p').textContent = `Parsing ${file.name}…`;

  const formData = new FormData();
  formData.append('modpack', file);

  try {
    const res = await fetch(`${API}/api/parse`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Parse failed');

    parsedPack = data;
    showPackInfo(data);
    revealStep(stepConfig);

    // Pre-fill target with current values
    document.getElementById('target-mc').value = data.mcVersion || '';
    const loaderSelect = document.getElementById('target-loader');
    if (data.modloader) {
      const opt = [...loaderSelect.options].find(o => o.value === data.modloader);
      if (opt) loaderSelect.value = data.modloader;
    }
    document.getElementById('target-loader-ver').value = data.modloaderVersion || '';
  } catch (err) {
    showToast(err.message);
    dropzone.querySelector('p').textContent = 'Drop .mrpack or CurseForge .zip here';
  }
}

function showPackInfo(data) {
  document.getElementById('info-name').textContent = data.name || '—';
  document.getElementById('info-mc').textContent = data.mcVersion || '—';
  document.getElementById('info-loader').textContent = data.modloader || '—';
  document.getElementById('info-loader-ver').textContent = data.modloaderVersion || '—';
  document.getElementById('info-mods').textContent = data.mods?.length ?? '—';
  document.getElementById('info-format').textContent = data.format === 'mrpack' ? '.mrpack' : 'CurseForge .zip';
  packInfo.classList.remove('hidden');
}

// ─── Resolve ────────────────────────────────────────────────────────────────
document.getElementById('btn-resolve').addEventListener('click', async () => {
  const targetMcVersion = document.getElementById('target-mc').value.trim();
  const targetModloader = document.getElementById('target-loader').value;
  const targetModloaderVersion = document.getElementById('target-loader-ver').value.trim();
  const cfApiKey = document.getElementById('cf-api-key').value.trim();

  if (!targetMcVersion) {
    showToast('Enter a target Minecraft version');
    return;
  }

  revealStep(stepResults);

  // Show progress
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressLabel.textContent = `Resolving ${parsedPack.mods.length} mods…`;

  // Animate progress bar indeterminately while waiting
  let fakeProgress = 0;
  const ticker = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 4, 88);
    progressFill.style.width = `${fakeProgress}%`;
  }, 200);

  try {
    const res = await fetch(`${API}/api/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mods: parsedPack.mods,
        targetMcVersion,
        targetModloader,
        targetModloaderVersion,
        cfApiKey: cfApiKey || null
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Resolution failed');

    clearInterval(ticker);
    progressFill.style.width = '100%';
    progressLabel.textContent = 'Done';
    setTimeout(() => progressBar.classList.add('hidden'), 600);

    resolvedMods = data.resolved;
    failedMods = data.failed;

    showResults(data.resolved, data.failed, targetMcVersion, targetModloader, targetModloaderVersion);
  } catch (err) {
    clearInterval(ticker);
    showToast(err.message);
    progressBar.classList.add('hidden');
  }
});

function showResults(resolved, failed, targetMcVersion, targetModloader, targetModloaderVersion) {
  const total = resolved.length + failed.length;

  // Summary stats
  document.getElementById('stat-resolved').textContent = resolved.length;
  document.getElementById('stat-failed').textContent = failed.length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('results-summary').classList.remove('hidden');

  // ── FAILED MODS PANEL ─────────────────────────────────────────────────────
  const failedPanel = document.getElementById('failed-panel');
  const failedList = document.getElementById('failed-list');

  if (failed.length > 0) {
    failedList.innerHTML = '';
    for (const mod of failed) {
      const item = document.createElement('div');
      item.className = 'failed-item';

      const ids = [
        mod.modrinthProjectId ? `Modrinth: ${mod.modrinthProjectId}` : null,
        mod.cfProjectId ? `CurseForge: ${mod.cfProjectId}` : null
      ].filter(Boolean).join(' · ');

      item.innerHTML = `
        <div class="failed-name">⚠ ${escHtml(mod.displayName)}</div>
        <div class="failed-reason">${escHtml(mod.reason)}</div>
        ${ids ? `<div class="failed-ids">${escHtml(ids)}</div>` : ''}
        ${mod.suggestions && mod.suggestions.length > 0 ? `
          <div class="suggestions">
            <span class="suggestions-label">Possible ${targetModloader} replacements:</span>
            ${mod.suggestions.map(s => `
              <a class="suggestion-item" href="${escHtml(s.url)}" target="_blank">
                <span class="suggestion-name">${escHtml(s.title)} <span class="platform-badge ${s.platform || 'modrinth'}">${s.platform === 'curseforge' ? 'CurseForge' : 'Modrinth'}</span></span>
                <span class="suggestion-desc">${escHtml(s.description?.slice(0, 80) || '')}${s.description?.length > 80 ? '…' : ''}</span>
              </a>
            `).join('')}
          </div>
        ` : ''}
      `;
      failedList.appendChild(item);
    }
    failedPanel.classList.remove('hidden');
  } else {
    failedPanel.classList.add('hidden');
  }

  // ── RESOLVED MODS ─────────────────────────────────────────────────────────
  const resolvedList = document.getElementById('resolved-list');
  document.getElementById('resolved-count').textContent = resolved.length;
  resolvedList.innerHTML = '';
  for (const mod of resolved) {
    const item = document.createElement('div');
    item.className = 'resolved-item';
    item.innerHTML = `
      <span class="resolved-item-name">${escHtml(mod.displayName)}</span>
      <span class="resolved-item-version">${escHtml(mod.versionName || mod.fileId || '')}</span>
      <span class="platform-badge ${mod.platform}">${mod.platform === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
    `;
    resolvedList.appendChild(item);
  }

  // ── DOWNLOAD SECTION ──────────────────────────────────────────────────────
  const downloadSection = document.getElementById('download-section');
  const downloadHint = document.getElementById('download-hint');
  const btnDownload = document.getElementById('btn-download');

  downloadSection.classList.remove('hidden');

  if (failed.length > 0) {
    btnDownload.disabled = true;
    downloadHint.textContent = `Fix or remove ${failed.length} failed mod${failed.length > 1 ? 's' : ''} to enable download.`;
  } else {
    btnDownload.disabled = false;
    downloadHint.textContent = `${resolved.length} mods ready · ${document.getElementById('output-format').value === 'mrpack' ? '.mrpack' : 'CurseForge .zip'} output`;
  }

  // Store for download
  btnDownload.dataset.mc = targetMcVersion;
  btnDownload.dataset.loader = targetModloader;
  btnDownload.dataset.loaderVer = targetModloaderVersion;
}

// Remove all failed mods and re-enable download
document.getElementById('btn-remove-failed').addEventListener('click', () => {
  if (!failedMods.length) return;
  const names = failedMods.map(m => m.displayName).join('\n• ');
  if (!confirm(`Remove these ${failedMods.length} mods from the pack?\n\n• ${names}`)) return;

  failedMods = [];
  document.getElementById('failed-panel').classList.add('hidden');

  document.getElementById('stat-failed').textContent = '0';
  const btn = document.getElementById('btn-download');
  btn.disabled = false;
  document.getElementById('download-hint').textContent =
    `${resolvedMods.length} mods ready · ${document.getElementById('output-format').value === 'mrpack' ? '.mrpack' : 'CurseForge .zip'} output (${failedMods.length} mods removed)`;
});

// ─── Download ────────────────────────────────────────────────────────────────
document.getElementById('btn-download').addEventListener('click', async () => {
  const btn = document.getElementById('btn-download');
  const outputFormat = document.getElementById('output-format').value;
  const cfApiKey = document.getElementById('cf-api-key').value.trim();

  btn.disabled = true;
  btn.textContent = 'Building pack…';

  try {
    const res = await fetch(`${API}/api/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsedPack,
        resolvedMods,
        outputFormat,
        targetMcVersion: btn.dataset.mc,
        targetModloader: btn.dataset.loader,
        targetModloaderVersion: btn.dataset.loaderVer,
        cfApiKey: cfApiKey || null
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Pack failed');
    }

    const blob = await res.blob();
    const ext = outputFormat === 'mrpack' ? '.mrpack' : '.zip';
    const filename = `${parsedPack.name || 'modpack'}-${btn.dataset.mc}${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    btn.textContent = '✓ Downloaded';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Download Pack';
    }, 3000);
  } catch (err) {
    showToast(err.message);
    btn.disabled = false;
    btn.textContent = 'Download Pack';
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function revealStep(el) {
  el.classList.remove('hidden');
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
