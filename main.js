const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

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

ipcMain.handle('git:init', async (_, folderPath, createIfMissing = true) => {
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
    }

    if (!createIfMissing) {
      return { mode: 'missing', hasUncommitted: false, branch: null }
    }

    {
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
    await git.reset(['--hard', 'HEAD'])
    await git.raw(['clean', '-fd'])
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

ipcMain.handle('git:restoreCommit', async (_, folderPath, commitHash) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(folderPath)
    await git.checkout([commitHash, '--', '.'])
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
})

// ─── IPC: Terminal (PTY) ─────────────────────────────────────────────────────

let ptyProcess = null
const CODEX_NPM_PREFIX = path.join(os.homedir(), '.codex-gui', 'npm-global')
const CODEX_LOCAL_BIN_DIR =
  process.platform === 'win32'
    ? path.join(CODEX_NPM_PREFIX, 'node_modules', '.bin')
    : path.join(CODEX_NPM_PREFIX, 'bin')

function resolveShell() {
  if (process.platform === 'win32') return 'cmd.exe'

  if (process.platform === 'linux') {
    return fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh'
  }

  const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean)
  const existing = candidates.find(candidate => fs.existsSync(candidate))
  return existing || '/bin/zsh'
}

function resolveShellCandidates() {
  if (process.platform === 'win32') return ['cmd.exe']
  if (process.platform === 'linux') return [fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh']

  return [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh']
    .filter(Boolean)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index)
    .filter(candidate => fs.existsSync(candidate))
}

function buildPtyEnv() {
  const defaultPath =
    process.platform === 'darwin'
      ? '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      : '/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

  return {
    ...process.env,
    PATH: [CODEX_LOCAL_BIN_DIR, process.env.PATH || defaultPath].filter(Boolean).join(path.delimiter),
    TERM: process.env.TERM || 'xterm-256color',
    COLORTERM: process.env.COLORTERM || 'truecolor',
  }
}

function buildMinimalPtyEnv(shellPath) {
  const defaultPath =
    process.platform === 'darwin'
      ? '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      : '/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

  let username = process.env.USER || process.env.LOGNAME || ''
  try {
    if (!username) username = os.userInfo().username
  } catch {
    // ignore and keep fallback
  }

  return {
    PATH: [CODEX_LOCAL_BIN_DIR, process.env.PATH || defaultPath].filter(Boolean).join(path.delimiter),
    HOME: os.homedir(),
    SHELL: shellPath || resolveShell(),
    USER: username,
    LOGNAME: username,
    TMPDIR: process.env.TMPDIR || '/tmp',
    LANG: process.env.LANG || 'en_US.UTF-8',
    TERM: process.env.TERM || 'xterm-256color',
    COLORTERM: process.env.COLORTERM || 'truecolor',
  }
}

ipcMain.handle('pty:start', async (event, folderPath) => {
  try {
    const pty = require('node-pty')
    const shells = resolveShellCandidates()
    const shell = shells[0] || resolveShell()
    const shellArgVariants =
      process.platform === 'win32'
        ? [['/k']]
        : process.platform === 'linux'
          ? [['--noprofile', '--norc', '-i'], ['-i'], []]
          : [['-il'], ['-i'], ['-l'], []]
    const cwdCandidates = [folderPath, os.homedir(), '/tmp']
      .filter(Boolean)
      .filter((candidate, index, arr) => arr.indexOf(candidate) === index)
      .filter(candidate => fs.existsSync(candidate))

    if (ptyProcess) {
      ptyProcess.kill()
      ptyProcess = null
    }

    let spawnError = null
    const spawnAttempts = []
    for (const candidateShell of shells.length ? shells : [shell]) {
      for (const candidateCwd of cwdCandidates.length ? cwdCandidates : [os.homedir()]) {
        const envCandidates = [buildPtyEnv(), buildMinimalPtyEnv(candidateShell)]
        for (const candidateArgs of shellArgVariants) {
          for (const [envIndex, candidateEnv] of envCandidates.entries()) {
            try {
              ptyProcess = pty.spawn(candidateShell, candidateArgs, {
                name: 'xterm-256color',
                cols: 100,
                rows: 30,
                cwd: candidateCwd,
                env: candidateEnv,
              })
              spawnError = null
              break
            } catch (err) {
              spawnError = err
              spawnAttempts.push({
                shell: candidateShell,
                cwd: candidateCwd,
                args: candidateArgs.join(' '),
                envMode: envIndex === 0 ? 'full' : 'minimal',
                code: err?.code || '',
                errno: err?.errno || '',
                message: err?.message || 'spawn failed',
              })
            }
          }
          if (ptyProcess) break
        }
        if (ptyProcess) break
      }
      if (ptyProcess) break
    }

    if (!ptyProcess) {
      const error = spawnError || new Error('Unable to start shell')
      error.spawnAttempts = spawnAttempts
      throw error
    }

    ptyProcess.onData(data => {
      event.sender.send('pty:data', data)
    })

    ptyProcess.onExit(() => {
      event.sender.send('pty:exit')
      ptyProcess = null
    })

    return { success: true }
  } catch (e) {
    const message = e?.message || 'Unknown PTY error'
    const isNativeModuleIssue =
      message.includes('NODE_MODULE_VERSION') ||
      message.includes('was compiled against a different Node.js version') ||
      message.includes('Cannot find module') ||
      message.includes('invalid ELF header')

    if (isNativeModuleIssue) {
      return {
        error: `${message}\n\nTry running: npm run rebuild:pty`,
      }
    }

    if (message.includes('posix_spawnp failed')) {
      const recentAttempts = (e?.spawnAttempts || [])
        .slice(-8)
        .map(
          attempt =>
            `- shell=${attempt.shell} cwd=${attempt.cwd} args="${attempt.args}" env=${attempt.envMode} code=${attempt.code || 'n/a'} errno=${attempt.errno || 'n/a'}`
        )
        .join('\n')

      return {
        error: `${message}\n\nTried shells: ${resolveShellCandidates().join(', ') || resolveShell()}\nRecent attempts:\n${recentAttempts || '- no attempt details'}\nTip: Try opening a different folder and retry.`,
      }
    }

    return { error: message }
  }
})

ipcMain.on('pty:write', (_, data) => {
  if (ptyProcess) ptyProcess.write(data)
})

ipcMain.on('pty:resize', (_, cols, rows) => {
  if (ptyProcess) ptyProcess.resize(cols, rows)
})

ipcMain.handle('pty:kill', async () => {
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcess = null
  }
})
