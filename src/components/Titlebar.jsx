import styles from './Titlebar.module.css'

export default function Titlebar({ folder, gitState, onOpenFolder, onEnableVersioning, status }) {
  const folderName = folder ? folder.split('/').pop() || folder.split('\\').pop() : null

  return (
    <div className={`${styles.titlebar} titlebar-drag`}>
      {/* macOS traffic lights spacer */}
      <div className={styles.trafficLights} />

      <div className={`${styles.content} titlebar-no-drag`}>
        <div className={styles.left}>
          {folder ? (
            <div className={styles.folderInfo}>
              <span className={styles.folderIcon}>⬡</span>
              <span className={styles.folderName}>{folderName}</span>
              {gitState && (
                <span
                  className={`${styles.badge} ${
                    gitState.mode === 'missing'
                      ? styles.badgeMissing
                      : gitState.mode === 'new'
                        ? styles.badgeNew
                        : styles.badgeExisting
                  }`}
                >
                  {gitState.mode === 'missing'
                    ? 'kein git'
                    : gitState.mode === 'new'
                      ? 'snapshot'
                      : `git · ${gitState.branch || 'main'}`}
                </span>
              )}
            </div>
          ) : (
            <span className={styles.appName}>Codex GUI</span>
          )}
        </div>

        <div className={styles.center}>
          {status && (
            <div className={`${styles.status} ${styles[`status_${status.type}`]}`}>
              <span className={styles.statusDot} />
              {status.message}
            </div>
          )}
        </div>

        <div className={styles.right}>
          {folder && gitState?.mode === 'missing' && (
            <button className={styles.versionBtn} onClick={onEnableVersioning}>
              Versionierung aktivieren
            </button>
          )}
          <button className={styles.openBtn} onClick={onOpenFolder}>
            {folder ? 'Anderer Ordner' : 'Ordner öffnen'}
          </button>
        </div>
      </div>
    </div>
  )
}
