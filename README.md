# PackShift — Modpack Converter

Migrate Minecraft modpacks to a new MC version or modloader. Supports `.mrpack` and CurseForge `.zip` as both input and output.

## Setup

```bash
npm install
npm start
# Open http://localhost:3000
```

For dev with auto-restart:
```bash
npm run dev
```

## Features

- **Parse** `.mrpack` (Modrinth) or CurseForge `.zip` — auto-detects MC version, modloader, loader version, mod count
- **Resolve** every mod against Modrinth and CurseForge APIs for the target MC version + modloader
- **Failed mods are shown by name** with the exact reason — no hunting through IDs
  - "No version found for Minecraft 1.21.1 + fabric on Modrinth, CurseForge"
  - "No platform ID found — mod may have been added manually"
- **Remove failed mods** from the pack with one click, or fix them manually
- **Output** as `.mrpack` or CurseForge `.zip`

## CurseForge API Key

CurseForge requires an API key to look up mods. Get a free one at:
https://console.curseforge.com

The key is only used server-side to proxy CurseForge requests — it is never stored or logged.

## Notes

- Modrinth is fully open, no key needed
- CurseForge mods included in `.mrpack` output are noted in `MODRINTH_MODS_MANUAL_INSTALL.txt` since the CF format doesn't support external URLs natively
- Overrides (config files, etc.) from the original `.mrpack` are preserved in the output
