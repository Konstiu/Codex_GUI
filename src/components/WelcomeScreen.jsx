import styles from './WelcomeScreen.module.css'

export default function WelcomeScreen({ onOpenFolder }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.icon}>⬡</div>
        <h1 className={styles.title}>Codex GUI</h1>
        <p className={styles.subtitle}>
          AI-assisted coding - no terminal expertise required
        </p>

        <div className={styles.features}>
          <div className={styles.feature}>
              <span className={styles.featureIcon}>📁</span>
              <div>
              <div className={styles.featureName}>Open project folder</div>
              <div className={styles.featureDesc}>Any folder - no Git required</div>
              </div>
            </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🤖</span>
            <div>
              <div className={styles.featureName}>Codex AI works</div>
              <div className={styles.featureDesc}>Read, write, and run code</div>
            </div>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔄</span>
            <div>
              <div className={styles.featureName}>Manage changes</div>
              <div className={styles.featureDesc}>Inspect diffs, keep, or revert</div>
            </div>
          </div>
        </div>

        <button className={styles.openBtn} onClick={onOpenFolder}>
          Open folder
          <span className={styles.arrow}>→</span>
        </button>

        <p className={styles.hint}>
          Tip: Codex CLI must be installed -{' '}
          <code className={styles.code}>npm install -g @openai/codex</code>
        </p>
      </div>
    </div>
  )
}
