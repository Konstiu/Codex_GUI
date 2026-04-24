const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Folder selection ───────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// ─── IPC: File system ────────────────────────────────────────────────────────

ipcMain.handle('fs:readDir', async (_, dirPath) => {
  function readDirRecursive(dirPath, depth = 0) {
    if (depth > 4) return []
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
          children: e.isDirectory() ? readDirRecursive(path.join(dirPath, e.name), depth + 1) : null,
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  }
  return readDirRecursive(dirPath)
})

ipcMain.handle('fs:readFile', async (_, filePath) => {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > 1024 * 1024) return { error: 'File too large to preview (>1MB)' }
    return { content: fs.readFileSync(filePath, 'utf-8') }
  } catch (e) {
    return { error: e.message }
  }
})

// ─── IPC: Git operations ─────────────────────────────────────────────────────

ipcMain.handle('git:init', async (_, folderPath) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(folderPath)
    const isRepo = await git.checkIsRepo().catch(() => false)

    if (isRepo) {
      const status = await git.status()
      return {
        mode: 'existing',
        hasUncommitted: status.files.length > 0,
        branch: status.current,
      }
    } else {
      await git.init()
      const files = fs.readdirSync(folderPath).filter(f => !f.startsWith('.'))
      if (files.length > 0) {
        await git.add('.')
        await git.commit('Initial snapshot — Codex GUI')
      }
      return { mode: 'new', hasUncommitted: false, branch: 'main' }
    }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('git:diff', async (_, folderPath) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(folderPath)
    const diff = await git.diff(['HEAD'])
    const status = await git.status()
    return { diff, changedFiles: status.files }
  } catch (e) {
    return { diff: '', changedFiles: [], error: e.message }
  }
})

ipcMain.handle('git:snapshot', async (_, folderPath, message) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(folderPath)
    await git.add('.')
    await git.commit(message || `Snapshot — ${new Date().toLocaleString()}`)
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('git:revert', async (_, folderPath) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(folderPath)
    await git.checkout(['.'])
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('git:log', async (_, folderPath) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(folderPath)
    const log = await git.log(['--max-count=20'])
    return { commits: log.all }
  } catch (e) {
    return { commits: [], error: e.message }
  }
})

// ─── IPC: Terminal (PTY) ─────────────────────────────────────────────────────

let ptyProcess = null

ipcMain.handle('pty:start', async (event, folderPath) => {
  try {
    const pty = require('node-pty')
    const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')

    if (ptyProcess) {
      ptyProcess.kill()
      ptyProcess = null
    }

    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: folderPath,
      env: process.env,
    })

    ptyProcess.onData(data => {
      event.sender.send('pty:data', data)
    })

    ptyProcess.onExit(() => {
      event.sender.send('pty:exit')
      ptyProcess = null
    })

    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('pty:write', async (_, data) => {
  if (ptyProcess) ptyProcess.write(data)
})

ipcMain.handle('pty:resize', async (_, cols, rows) => {
  if (ptyProcess) ptyProcess.resize(cols, rows)
})

ipcMain.handle('pty:kill', async () => {
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcess = null
  }
})
