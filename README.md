# Codex GUI

Eine grafische Oberfläche für [Codex CLI](https://github.com/openai/codex) — AI-gestütztes Coding ohne Terminal-Kenntnisse.

## Features

- **File Explorer** — Projektordner öffnen, Dateien durchsuchen, geänderte Dateien hervorheben
- **Embedded Terminal** — xterm.js + node-pty, startet direkt im Projektordner
- **Diff Viewer** — zeigt Änderungen von Codex in Echtzeit an
- **Version Control** — automatisches Git im Hintergrund (unsichtbar für den User)
  - Kein `.git` vorhanden → wird automatisch angelegt, Snapshot erstellt
  - `.git` vorhanden → wird genutzt, keine automatischen Commits
- **Zurücksetzen** — Änderungen auf einen Knopfdruck rückgängig machen
- **Versionsverlauf** — gespeicherte Snapshots anzeigen

## Voraussetzungen

```bash
# Node.js >= 18 (https://nodejs.org)
node --version

# Codex CLI installieren
npm install -g @openai/codex
```

## Installation & Start

```bash
# Dependencies installieren
npm install

# Falls das eingebettete Terminal nicht startet (node-pty):
npm run rebuild:pty

# Im Entwicklungsmodus starten (Vite + Electron)
npm run dev

# Für Produktion bauen
npm run build
```

## Projektstruktur

```
codex-gui/
├── main.js              # Electron Hauptprozess (IPC, Git, PTY)
├── preload.js           # Electron Preload (sichere API-Brücke)
├── vite.config.js       # Vite Konfiguration
├── index.html           # HTML Entry Point
└── src/
    ├── main.jsx         # React Entry Point
    ├── App.jsx          # Hauptkomponente (Layout + State)
    ├── styles/
    │   ├── global.css   # Globale Styles + CSS Variables
    │   └── App.module.css
    └── components/
        ├── Titlebar.jsx         # Titelleiste mit Status
        ├── WelcomeScreen.jsx    # Startbildschirm
        ├── FileExplorer.jsx     # Dateibaum links
        ├── Terminal.jsx         # xterm.js Terminal mitte
        └── DiffViewer.jsx       # Diff + Versionierung rechts
```

## Git-Logik

| Situation | Was passiert |
|-----------|-------------|
| Ordner hat kein `.git` | Automatisch `git init` + Initial Commit (Snapshot) |
| Ordner hat `.git` | Wird genutzt, keine automatischen Commits |
| User klickt "Version speichern" | `git add . && git commit` |
| User klickt "Zurücksetzen" | `git checkout .` |

Der User sieht kein Git — nur "Snapshot erstellt", "Version speichern", "Zurücksetzen".

## Technologien

- **Electron** — Cross-Platform Desktop App
- **React + Vite** — Frontend
- **xterm.js + @xterm/addon-fit** — Terminal-Emulator
- **node-pty** — Native PTY für echtes Terminal
- **simple-git** — Git-Operationen
