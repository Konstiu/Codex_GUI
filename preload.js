const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Folder dialog
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  // File system
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),

  // Git
  gitInit: (folder) => ipcRenderer.invoke('git:init', folder),
  gitDiff: (folder) => ipcRenderer.invoke('git:diff', folder),
  gitSnapshot: (folder, msg) => ipcRenderer.invoke('git:snapshot', folder, msg),
  gitRevert: (folder) => ipcRenderer.invoke('git:revert', folder),
  gitLog: (folder) => ipcRenderer.invoke('git:log', folder),
  gitRestoreCommit: (folder, commitHash) => ipcRenderer.invoke('git:restoreCommit', folder, commitHash),

  // Terminal (PTY)
  ptyStart: (folder) => ipcRenderer.invoke('pty:start', folder),
  ptyWrite: (data) => ipcRenderer.send('pty:write', data),
  ptyResize: (cols, rows) => ipcRenderer.send('pty:resize', cols, rows),
  ptyKill: () => ipcRenderer.invoke('pty:kill'),
  onPtyData: (cb) => ipcRenderer.on('pty:data', (_, data) => cb(data)),
  onPtyExit: (cb) => ipcRenderer.on('pty:exit', cb),
  offPtyData: () => ipcRenderer.removeAllListeners('pty:data'),
  offPtyExit: () => ipcRenderer.removeAllListeners('pty:exit'),
})
