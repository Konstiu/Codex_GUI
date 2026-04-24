import styles from './WelcomeScreen.module.css'

export default function WelcomeScreen({ onOpenFolder }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.icon}>⬡</div>
        <h1 className={styles.title}>Codex GUI</h1>
        <p className={styles.subtitle}>
          AI-gestütztes Coding — ohne Terminal-Kenntnisse
        </p>

        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📁</span>
            <div>
              <div className={styles.featureName}>Projektordner öffnen</div>
              <div className={styles.featureDesc}>Beliebiger Ordner — kein Git nötig</div>
            </div>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🤖</span>
            <div>
              <div className={styles.featureName}>Codex AI arbeitet</div>
              <div className={styles.featureDesc}>Code lesen, schreiben, ausführen</div>
            </div>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔄</span>
            <div>
              <div className={styles.featureName}>Änderungen verwalten</div>
              <div className={styles.featureDesc}>Diff ansehen, behalten oder zurücksetzen</div>
            </div>
          </div>
        </div>

        <button className={styles.openBtn} onClick={onOpenFolder}>
          Ordner öffnen
          <span className={styles.arrow}>→</span>
        </button>

        <p className={styles.hint}>
          Tipp: Codex CLI muss installiert sein —{' '}
          <code className={styles.code}>npm install -g @openai/codex</code>
        </p>
      </div>
    </div>
  )
}
