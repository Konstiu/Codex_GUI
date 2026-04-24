import { useState, useCallback } from 'react'
import styles from './DiffViewer.module.css'

function parseDiff(diffText) {
  if (!diffText) return []

  const files = []
  let currentFile = null
  let currentHunk = null

  const lines = diffText.split('\n')

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile)
      const match = line.match(/b\/(.+)$/)
      currentFile = { name: match?.[1] || 'unknown', hunks: [] }
      currentHunk = null
    } else if (line.startsWith('@@')) {
      currentHunk = { header: line, lines: [] }
      currentFile?.hunks.push(currentHunk)
    } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.lines.push(line)
    }
  }

  if (currentFile) files.push(currentFile)
  return files
}

function DiffLine({ line }) {
  let cls = styles.lineContext
  let prefix = ' '

  if (line.startsWith('+')) { cls = styles.lineAdded; prefix = '+' }
  else if (line.startsWith('-')) { cls = styles.lineRemoved; prefix = '-' }

  return (
    <div className={`${styles.diffLine} ${cls}`}>
      <span className={styles.linePrefix}>{prefix}</span>
      <span className={styles.lineContent}>{line.slice(1)}</span>
    </div>
  )
}

function FileDiff({ file, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const addedLines = file.hunks.flatMap(h => h.lines).filter(l => l.startsWith('+')).length
  const removedLines = file.hunks.flatMap(h => h.lines).filter(l => l.startsWith('-')).length

  return (
    <div className={styles.fileDiff}>
      <div className={styles.fileHeader} onClick={() => setOpen(o => !o)}>
        <span className={styles.fileChevron}>{open ? '▾' : '▸'}</span>
        <span className={styles.fileName}>{file.name}</span>
        <div className={styles.fileStats}>
          {addedLines > 0 && <span className={styles.statAdded}>+{addedLines}</span>}
          {removedLines > 0 && <span className={styles.statRemoved}>-{removedLines}</span>}
        </div>
      </div>

      {open && (
        <div className={styles.hunks}>
          {file.hunks.map((hunk, i) => (
            <div key={i} className={styles.hunk}>
              <div className={styles.hunkHeader}>{hunk.header}</div>
              {hunk.lines.map((line, j) => (
                <DiffLine key={j} line={line} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DiffViewer({ diff, changedFiles, onSnapshot, onRevert, onRestoreCommit, folder }) {
  const [snapshotMsg, setSnapshotMsg] = useState('')
  const [showSnapshotInput, setShowSnapshotInput] = useState(false)
  const [activeTab, setActiveTab] = useState('changes') // 'changes' | 'history'
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const parsedFiles = parseDiff(diff)
  const hasChanges = changedFiles?.length > 0

  const handleSnapshot = useCallback(async () => {
    await onSnapshot(snapshotMsg || undefined)
    setSnapshotMsg('')
    setShowSnapshotInput(false)
  }, [onSnapshot, snapshotMsg])

  const loadHistory = useCallback(async () => {
    setActiveTab('history')
    setLoadingHistory(true)
    const result = await window.api.gitLog(folder)
    setHistory(result.commits || [])
    setLoadingHistory(false)
  }, [folder])

  const handleRestoreCommit = useCallback(async (hash) => {
    await onRestoreCommit(hash)
    await loadHistory()
  }, [onRestoreCommit, loadHistory])

  return (
    <div className={styles.viewer}>
      {/* Header tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'changes' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          Änderungen
          {hasChanges && <span className={styles.tabBadge}>{changedFiles.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`}
          onClick={loadHistory}
        >
          Verlauf
        </button>
      </div>

      {/* Action buttons */}
      <div className={styles.actions}>
        {hasChanges ? (
          <>
            <button
              className={`${styles.actionBtn} ${styles.actionRevert}`}
              onClick={onRevert}
            >
              ↩ Zurücksetzen
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionSave}`}
              onClick={() => setShowSnapshotInput(s => !s)}
            >
              💾 Version speichern
            </button>
          </>
        ) : (
          <div className={styles.noChanges}>
            <span className={styles.noChangesIcon}>✓</span>
            Keine Änderungen
          </div>
        )}
      </div>

      {/* Snapshot input */}
      {showSnapshotInput && (
        <div className={styles.snapshotInput}>
          <input
            className={styles.msgInput}
            placeholder="Beschreibung (optional)…"
            value={snapshotMsg}
            onChange={e => setSnapshotMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSnapshot()}
            autoFocus
          />
          <button className={`${styles.actionBtn} ${styles.actionSave}`} onClick={handleSnapshot}>
            Speichern
          </button>
        </div>
      )}

      {/* Content area */}
      <div className={styles.content}>
        {activeTab === 'changes' && (
          <>
            {!hasChanges ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>◈</div>
                <p>Noch keine Änderungen durch Codex.</p>
                <p>Starte das Terminal und führe Codex aus.</p>
              </div>
            ) : parsedFiles.length === 0 ? (
              <div className={styles.changedList}>
                {changedFiles.map((f, i) => (
                  <div key={i} className={styles.changedFile}>
                    <span className={styles.changedStatus}>{f.index?.[0] || '?'}</span>
                    <span className={styles.changedName}>{f.path || f.from}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.diffList}>
                {parsedFiles.map((file, i) => (
                  <FileDiff key={i} file={file} defaultOpen={parsedFiles.length === 1} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div className={styles.historyList}>
            {loadingHistory ? (
              <div className={styles.loading}>Lade Verlauf…</div>
            ) : history.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Noch keine gespeicherten Versionen.</p>
              </div>
            ) : (
              history.map((commit, i) => (
                <div key={i} className={styles.commit}>
                  <div className={styles.commitDot} />
                  <div className={styles.commitInfo}>
                    <div className={styles.commitMessage}>{commit.message}</div>
                    <div className={styles.commitMeta}>
                      {new Date(commit.date).toLocaleString('de-AT', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      <span className={styles.commitHash}>{commit.hash.slice(0, 7)}</span>
                    </div>
                  </div>
                  <button
                    className={`${styles.actionBtn} ${styles.actionRestore}`}
                    onClick={() => handleRestoreCommit(commit.hash)}
                    title={`Stand ${commit.hash.slice(0, 7)} wiederherstellen`}
                  >
                    Zu diesem Stand
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
