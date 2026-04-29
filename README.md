# Codex GUI

A desktop GUI for [Codex CLI](https://github.com/openai/codex) - AI-assisted coding with an embedded terminal and built-in versioning workflow.

## Features

- **File Explorer** - open a project folder, browse files, highlight changed files
- **Embedded Terminal** - xterm.js + node-pty, starts directly in your project folder
- **Diff Viewer** - shows Codex changes in near real time
- **Version Control** - Git workflow integrated in the UI
  - No `.git` present -> you can enable versioning and create an initial snapshot
  - Existing `.git` present -> repository is reused
- **Revert** - roll back working changes quickly
- **History** - view and restore saved snapshots

## Requirements

```bash
# Node.js >= 18 (https://nodejs.org)
node --version

# Install Codex CLI
npm install -g @openai/codex
```

## Install & Run

```bash
# Install dependencies
npm install

# If embedded terminal does not start correctly (node-pty)
npm run rebuild:pty

# Start in development mode (Vite + Electron)
npm run dev

# Build production app
npm run build
```

### macOS Note (App from Downloads/Releases)

If macOS blocks the app on first launch, remove the quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Codex GUI.app"
```

## Project Structure

```text
codex-gui/
├── main.js              # Electron main process (IPC, Git, PTY)
├── preload.js           # Electron preload (safe API bridge)
├── vite.config.js       # Vite config
├── index.html           # HTML entry point
└── src/
    ├── main.jsx         # React entry point
    ├── App.jsx          # Main layout + app state
    ├── styles/
    │   ├── global.css   # Global styles + CSS variables
    │   └── App.module.css
    └── components/
        ├── Titlebar.jsx          # Top bar with folder + actions
        ├── FileExplorer.jsx      # File tree (left)
        ├── Terminal.jsx          # xterm.js terminal (center)
        ├── DiffViewer.jsx        # Changes/history panel (right)
        └── WelcomeScreen.jsx     # Legacy welcome screen component
```

## Git Behavior

| Situation | Behavior |
|-----------|----------|
| Folder has no `.git` | You can enable versioning to run `git init` + initial commit |
| Folder has `.git` | Existing repository is used |
| User clicks `Save version` | `git add . && git commit` |
| User clicks `Revert` | Revert working changes to `HEAD` |

## Tech Stack

- **Electron** - cross-platform desktop app shell
- **React + Vite** - frontend
- **xterm.js + @xterm/addon-fit** - terminal emulator
- **node-pty** - native PTY bridge
- **simple-git** - Git operations
