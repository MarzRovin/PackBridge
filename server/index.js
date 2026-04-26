const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { parseMrpack } = require('./parsers/mrpack');
const { parseCurseForge } = require('./parsers/curseforge');
const { resolveMods } = require('./resolvers/resolver');
const { packMrpack } = require('./packers/mrpack');
const { packCurseForge } = require('./packers/curseforge');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Parse uploaded modpack — detect format, extract metadata
app.post('/api/parse', upload.single('modpack'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    let result;
    if (file.originalname.endsWith('.mrpack')) {
      result = await parseMrpack(file.buffer);
    } else if (file.originalname.endsWith('.zip')) {
      result = await parseCurseForge(file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported format. Upload a .mrpack or .zip file.' });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Resolve mods for new MC version / modloader
app.post('/api/resolve', async (req, res) => {
  try {
    const { mods, targetMcVersion, targetModloader, targetModloaderVersion, cfApiKey } = req.body;
    if (!mods || !targetMcVersion || !targetModloader) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await resolveMods(mods, targetMcVersion, targetModloader, targetModloaderVersion, cfApiKey);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Build and download the new modpack
app.post('/api/pack', async (req, res) => {
  try {
    const { parsedPack, resolvedMods, outputFormat, targetMcVersion, targetModloader, targetModloaderVersion, cfApiKey } = req.body;

    let buffer, filename, contentType;

    if (outputFormat === 'mrpack') {
      buffer = await packMrpack(parsedPack, resolvedMods, targetMcVersion, targetModloader, targetModloaderVersion);
      filename = `${parsedPack.name || 'modpack'}-${targetMcVersion}.mrpack`;
      contentType = 'application/zip';
    } else {
      buffer = await packCurseForge(parsedPack, resolvedMods, targetMcVersion, targetModloader, targetModloaderVersion, cfApiKey);
      filename = `${parsedPack.name || 'modpack'}-${targetMcVersion}.zip`;
      contentType = 'application/zip';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Modpack Converter running on http://localhost:${PORT}`));
