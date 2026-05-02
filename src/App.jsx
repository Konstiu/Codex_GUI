import {useCallback, useEffect, useRef, useState} from 'react'
import FileExplorer from './components/FileExplorer.jsx'
import Terminal from './components/Terminal.jsx'
import DiffViewer from './components/DiffViewer.jsx'
import Titlebar from './components/Titlebar.jsx'
import styles from './styles/App.module.css'

export default function App() {
    const [folder, setFolder] = useState(null)
    const [gitState, setGitState] = useState(null) // { mode, hasUncommitted, branch }
    const [diffData, setDiffData] = useState({diff: '', changedFiles: []})
    const [selectedFile, setSelectedFile] = useState(null)
    const [status, setStatus] = useState(null) // { type: 'info'|'success'|'error', message }
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
    const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
    const didPromptForFolderRef = useRef(false)
    const terminalRef = useRef(null)

    const showStatus = useCallback((type, message) => {
        setStatus({type, message})
        setTimeout(() => setStatus(null), 3500)
    }, [])

    const openFolder = useCallback(async () => {
        const path = await window.api.openFolder()
        if (!path) return

        // If the terminal is already running, hand the folder change off to it.
        // It will stop Codex, kill the PTY, then restart with `codex resume` in the new dir.
        if (terminalRef.current?.changeFolder) {
            setFolder(path)
            setGitState(null)
            setSelectedFile(null)
            setDiffData({diff: '', changedFiles: []})

            await terminalRef.current.changeFolder(path)

            const result = await window.api.gitInit(path, false)
            if (!result.error) {
                setGitState(result)
                showStatus(
                    'info',
                    result.mode === 'existing'
                        ? `Switched folder — Git (${result.branch || 'main'})`
                        : 'Switched folder — no Git repo'
                )
            }
            return
        }

        // Cold start — terminal hasn't been started yet.
        setFolder(path)
        setGitState(null)
        setSelectedFile(null)
        setDiffData({diff: '', changedFiles: []})
        setIsSidebarCollapsed(false)
        setIsPanelCollapsed(false)

        const result = await window.api.gitInit(path, false)
        if (result.error) {
            showStatus('error', 'Could not read Git state: ' + result.error)
            return
        }

        setGitState(result)

        if (result.mode === 'existing') {
            showStatus('info', `Git repository detected (${result.branch || 'main'})`)
        } else if (result.mode === 'missing') {
            showStatus('info', 'No Git repository found - you can enable versioning if needed')
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
            showStatus('error', 'Failed to initialize Git: ' + result.error)
            return
        }

        setGitState(result)
        showStatus('success', 'Versioning enabled - initial snapshot created')
        await refreshDiff()
    }, [folder, refreshDiff, showStatus])

    const handleSnapshot = useCallback(async (message) => {
        if (!folder) return
        const result = await window.api.gitSnapshot(folder, message)
        if (result.error) {
            showStatus('error', 'Snapshot failed: ' + result.error)
        } else {
            showStatus('success', 'Version saved ✓')
            await refreshDiff()
        }
    }, [folder, refreshDiff, showStatus])

    const handleRevert = useCallback(async () => {
        if (!folder) return
        const result = await window.api.gitRevert(folder)
        if (result.error) {
            showStatus('error', 'Revert failed: ' + result.error)
        } else {
            showStatus('success', 'Changes reverted ✓')
            await refreshDiff()
        }
    }, [folder, refreshDiff, showStatus])

    const handleRestoreCommit = useCallback(async (commitHash) => {
        if (!folder) return
        const result = await window.api.gitRestoreCommit(folder, commitHash)
        if (result.error) {
            showStatus('error', 'Restore failed: ' + result.error)
        } else {
            showStatus('success', `Restored ${commitHash.slice(0, 7)}`)
            await refreshDiff()
        }
    }, [folder, refreshDiff, showStatus])

    useEffect(() => {
        if (didPromptForFolderRef.current || folder) return
        didPromptForFolderRef.current = true
        openFolder()
    }, [folder, openFolder])

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

            <div
                className={`${styles.layout} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''} ${isPanelCollapsed ? styles.panelCollapsed : ''}`}
            >
                <div className={styles.sidebar}>
                    {folder ? (
                        <FileExplorer
                            folder={folder}
                            selectedFile={selectedFile}
                            onSelectFile={setSelectedFile}
                            changedFiles={diffData.changedFiles}
                        />
                    ) : (
                        <div className={styles.emptyPane}>Select a project folder to start.</div>
                    )}
                </div>

                <button
                    className={styles.collapseRail}
                    onClick={() => setIsSidebarCollapsed(v => !v)}
                    title={isSidebarCollapsed ? 'Show files' : 'Hide files'}
                >
                    {isSidebarCollapsed ? '▸' : '◂'}
                </button>

                <div className={styles.center}>
                    <Terminal ref={terminalRef} folder={folder} onOutput={refreshDiff}/>
                </div>

                <button
                    className={styles.collapseRail}
                    onClick={() => setIsPanelCollapsed(v => !v)}
                    title={isPanelCollapsed ? 'Show versioning' : 'Hide versioning'}
                >
                    {isPanelCollapsed ? '◂' : '▸'}
                </button>

                <div className={styles.panel}>
                    {folder ? (
                        <DiffViewer
                            diff={diffData.diff}
                            changedFiles={diffData.changedFiles}
                            selectedFile={selectedFile}
                            onSnapshot={handleSnapshot}
                            onRevert={handleRevert}
                            onRestoreCommit={handleRestoreCommit}
                            folder={folder}
                        />
                    ) : (
                        <div className={styles.emptyPane}>Versioning panel appears after folder selection.</div>
                    )}
                </div>
            </div>
        </div>
    )
}