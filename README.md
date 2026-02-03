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

## Getting Started

### Prerequisites

**Install Node.js** (includes npm)
- Download from https://nodejs.org
- Recommended: LTS version (v20 or v22)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd focustree

# Install dependencies
npm install
```

### Running in Development

```bash
# Run as desktop app (Electron)
npm run dev

# Run as web app only (browser)
npm run dev:web
```

### Building for Distribution

#### macOS
```bash
npm run package:mac
```
Output: `release/OnionOps-<version>-universal.dmg`

To install:
1. Open the `.dmg` file in `release/`
2. Drag the OnionOps app to your Applications folder
3. Launch from Applications (first launch may require right-click → Open due to Gatekeeper)

#### Windows
```bash
npm run package:win
```
Output: `release/OnionOps Setup <version>.exe`

To install:
1. Run the `.exe` installer in `release/`
2. Follow the installation wizard
3. Launch from Start Menu or Desktop shortcut

#### Linux
```bash
npm run package:linux
```

## NPM Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron + Vite in dev mode |
| `npm run dev:web` | Start only the Vite web dev server |
| `npm run build` | Build Electron main + preload + renderer |
| `npm run build:web` | Build only the renderer |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the Vite build |
| `npm run package` | Build and package for current platform |
| `npm run package:mac` | Package macOS app |
| `npm run package:win` | Package Windows app |
| `npm run package:linux` | Package Linux app |
| `npm run clean` | Remove local app data (reset to initial state)
