import { useState, useEffect } from 'react'
import styles from './FileExplorer.module.css'

function getFileIcon(name, isDirectory) {
  if (isDirectory) return '▸'
  const ext = name.split('.').pop()?.toLowerCase()
  const icons = {
    js: 'JS', jsx: 'JS', ts: 'TS', tsx: 'TS',
    py: 'PY', rb: 'RB', go: 'GO', rs: 'RS',
    html: 'HT', css: 'CS', scss: 'SC',
    json: '{}', md: 'MD', txt: 'TX',
    sh: 'SH', yaml: 'YL', yml: 'YL',
    png: '▣', jpg: '▣', svg: '▣', gif: '▣',
  }
  return icons[ext] || '·'
}

function getFileColor(name, isDirectory, isChanged) {
  if (isChanged) return '#f6ad55'
  if (isDirectory) return '#9090a0'
  const ext = name.split('.').pop()?.toLowerCase()
  const colors = {
    js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#61dafb',
    py: '#3572a5', rb: '#701516', go: '#00add8', rs: '#dea584',
    html: '#e34c26', css: '#563d7c', scss: '#c6538c',
    json: '#cb9032', md: '#a0a0a0',
  }
  return colors[ext] || '#5a5a6a'
}

function FileNode({ node, depth, selectedFile, onSelectFile, changedPaths }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const isChanged = changedPaths.has(node.path)
  const iconText = getFileIcon(node.name, node.isDirectory)
  const color = getFileColor(node.name, node.isDirectory, isChanged)
  const isSelected = selectedFile?.path === node.path

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded(e => !e)
    } else {
      onSelectFile(node)
    }
  }

  return (
    <div>
      <div
        className={`${styles.node} ${isSelected ? styles.selected : ''} ${isChanged ? styles.changed : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={handleClick}
      >
        <span className={styles.icon} style={{ color }}>
          {node.isDirectory ? (expanded ? '▾' : '▸') : iconText}
        </span>
        <span className={styles.name}>{node.name}</span>
        {isChanged && <span className={styles.changeDot} />}
      </div>

      {node.isDirectory && expanded && node.children && (
        <div>
          {node.children.map(child => (
            <FileNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              changedPaths={changedPaths}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileExplorer({ folder, selectedFile, onSelectFile, changedFiles }) {
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!folder) return
    setLoading(true)
    window.api.readDir(folder).then(result => {
      setTree(result)
      setLoading(false)
    })
  }, [folder])

  // Refresh tree when changed files update
  useEffect(() => {
    if (!folder || changedFiles?.length === 0) return
    window.api.readDir(folder).then(result => setTree(result))
  }, [changedFiles?.length])

  const changedPaths = new Set(changedFiles?.map(f => {
    const rel = f.path || f.from || ''
    return folder + '/' + rel
  }) || [])

  const folderName = folder?.split('/').pop() || folder?.split('\\').pop() || folder

  return (
    <div className={styles.explorer}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Dateien</span>
        <button
          className={styles.refreshBtn}
          onClick={() => window.api.readDir(folder).then(setTree)}
          title="Aktualisieren"
        >
          ↻
        </button>
      </div>

      <div className={styles.folderRoot}>
        <span className={styles.rootIcon}>⬡</span>
        <span className={styles.rootName}>{folderName}</span>
      </div>

      <div className={styles.tree}>
        {loading ? (
          <div className={styles.loading}>Lade Dateien…</div>
        ) : (
          tree.map(node => (
            <FileNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              changedPaths={changedPaths}
            />
          ))
        )}
      </div>
    </div>
  )
}
