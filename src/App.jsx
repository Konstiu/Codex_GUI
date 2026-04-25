import { useState, useCallback, useEffect } from 'react'
import FileExplorer from './components/FileExplorer.jsx'
import Terminal from './components/Terminal.jsx'
import DiffViewer from './components/DiffViewer.jsx'
import Titlebar from './components/Titlebar.jsx'
import WelcomeScreen from './components/WelcomeScreen.jsx'
import styles from './styles/App.module.css'

export default function App() {
  const [folder, setFolder] = useState(null)
  const [gitState, setGitState] = useState(null) // { mode, hasUncommitted, branch }
  const [diffData, setDiffData] = useState({ diff: '', changedFiles: [] })
  const [selectedFile, setSelectedFile] = useState(null)
  const [status, setStatus] = useState(null) // { type: 'info'|'success'|'error', message }
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)

  const showStatus = useCallback((type, message) => {
    setStatus({ type, message })
    setTimeout(() => setStatus(null), 3500)
  }, [])

  const openFolder = useCallback(async () => {
    const path = await window.api.openFolder()
    if (!path) return

    setFolder(path)
    setGitState(null)
    setSelectedFile(null)
    setDiffData({ diff: '', changedFiles: [] })
    setIsSidebarCollapsed(false)
    setIsPanelCollapsed(false)

    const result = await window.api.gitInit(path, false)
    if (result.error) {
      showStatus('error', 'Git-Status konnte nicht gelesen werden: ' + result.error)
      return
    }

    setGitState(result)

    if (result.mode === 'existing') {
      showStatus('info', `Git-Repository erkannt (${result.branch || 'main'})`)
    } else if (result.mode === 'missing') {
      showStatus('info', 'Kein Git-Repository gefunden — optional über "Versionierung aktivieren"')
    }
  }, [showStatus])

  const refreshDiff = useCallback(async () => {
    if (!folder || gitState?.mode === 'missing') return
    const result = await window.api.gitDiff(folder)
    setDiffData(result)
  }, [folder, gitState?.mode])

  const enableVersioning = useCallback(async () => {
    if (!folder) return
    const result = await window.api.gitInit(folder, true)
    if (result.error) {
      showStatus('error', 'Git konnte nicht initialisiert werden: ' + result.error)
      return
    }

    setGitState(result)
    showStatus('success', 'Versionierung aktiviert — Initial-Snapshot erstellt')
    await refreshDiff()
  }, [folder, refreshDiff, showStatus])

  const handleSnapshot = useCallback(async (message) => {
    if (!folder) return
    const result = await window.api.gitSnapshot(folder, message)
    if (result.error) {
      showStatus('error', 'Snapshot fehlgeschlagen: ' + result.error)
    } else {
      showStatus('success', 'Version gespeichert ✓')
      await refreshDiff()
    }
  }, [folder, refreshDiff, showStatus])

  const handleRevert = useCallback(async () => {
    if (!folder) return
    const result = await window.api.gitRevert(folder)
    if (result.error) {
      showStatus('error', 'Zurücksetzen fehlgeschlagen: ' + result.error)
    } else {
      showStatus('success', 'Änderungen zurückgesetzt ✓')
      await refreshDiff()
    }
  }, [folder, refreshDiff, showStatus])

  const handleRestoreCommit = useCallback(async (commitHash) => {
    if (!folder) return
    const result = await window.api.gitRestoreCommit(folder, commitHash)
    if (result.error) {
      showStatus('error', 'Wiederherstellen fehlgeschlagen: ' + result.error)
    } else {
      showStatus('success', `Stand ${commitHash.slice(0, 7)} wiederhergestellt`)
      await refreshDiff()
    }
  }, [folder, refreshDiff, showStatus])

  // Auto-refresh diff every 3 seconds when a folder is open
  useEffect(() => {
    if (!folder) return
    const interval = setInterval(refreshDiff, 3000)
    return () => clearInterval(interval)
  }, [folder, refreshDiff])

  return (
    <div className={styles.app}>
      <Titlebar
        folder={folder}
        gitState={gitState}
        onOpenFolder={openFolder}
        onEnableVersioning={enableVersioning}
        status={status}
      />

      {!folder ? (
        <WelcomeScreen onOpenFolder={openFolder} />
      ) : (
        <div
          className={`${styles.layout} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''} ${isPanelCollapsed ? styles.panelCollapsed : ''}`}
        >
          {!isSidebarCollapsed && (
            <div className={styles.sidebar}>
              <FileExplorer
                folder={folder}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                changedFiles={diffData.changedFiles}
              />
            </div>
          )}

          <div className={styles.center}>
            <div className={styles.centerToolbar}>
              <button
                className={styles.collapseBtn}
                onClick={() => setIsSidebarCollapsed(v => !v)}
                title={isSidebarCollapsed ? 'Dateien einblenden' : 'Dateien ausblenden'}
              >
                <span className={styles.collapseIcon}>{isSidebarCollapsed ? '◂' : '▸'}</span>
                <span className={styles.collapseLabel}>Dateien</span>
              </button>
              <button
                className={styles.collapseBtn}
                onClick={() => setIsPanelCollapsed(v => !v)}
                title={isPanelCollapsed ? 'Versionierung einblenden' : 'Versionierung ausblenden'}
              >
                <span className={styles.collapseLabel}>Versionierung</span>
                <span className={styles.collapseIcon}>{isPanelCollapsed ? '▸' : '◂'}</span>
              </button>
            </div>
            <Terminal folder={folder} onOutput={refreshDiff} />
          </div>

          {!isPanelCollapsed && (
            <div className={styles.panel}>
              <DiffViewer
                diff={diffData.diff}
                changedFiles={diffData.changedFiles}
                selectedFile={selectedFile}
                onSnapshot={handleSnapshot}
                onRevert={handleRevert}
                onRestoreCommit={handleRestoreCommit}
                folder={folder}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
