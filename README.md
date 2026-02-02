# OnionOps

OnionOps is a layered planning and focus app built around the idea that progress comes from organizing work in clear, nested layers (Grand Plan → Month → Daily). It provides guided onboarding, visual planning boards, and daily focus sessions to help users execute consistently.

## Project Structure

- **Electron (main process):** desktop app shell, storage, native window integration.
- **React + Vite (renderer):** UI, onboarding flows, planning boards, daily agenda.
- **Local storage:** JSON-backed state stored under the user data directory.

Tech stack:
- Electron
- React
- TypeScript
- Vite

## Quick Start (from a cloned repo)

### macOS
```bash
bash scripts/install-mac.sh
npm run dev
```

### Windows (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-win.ps1
npm run dev
```

### Linux
```bash
bash scripts/install-linux.sh
npm run dev
```

## Manual Install

Requirements:
- Git
- Node.js (LTS) + npm

Steps:
```bash
npm install
npm run dev
```

## Packaging (optional)

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

The packaged app is output to the `release/` folder.

## Notes

- The scripts assume you are running them from the repo root (where `package.json` lives).
- The app name is **OnionOps**.

## NPM Commands

- `npm run dev` — start Electron + Vite in dev mode
- `npm run dev:web` — start only the Vite web dev server
- `npm run build` — build Electron main + preload + renderer
- `npm run build:web` — build only the renderer
- `npm run lint` — run ESLint
- `npm run preview` — preview the Vite build
- `npm run package` — build and package for current platform
- `npm run package:mac` — package macOS app
- `npm run package:win` — package Windows app
- `npm run package:linux` — package Linux app
- `npm run clean` — remove local app data (reset to initial state)
