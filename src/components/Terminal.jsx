import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './Terminal.module.css'

export default function Terminal({ folder, onOutput }) {
  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const containerRef = useRef(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const outputBuffer = useRef('')

  // Initialize xterm.js
  useEffect(() => {
    let term
    let fitAddon

    const init = async () => {
      const { Terminal: XTerm } = await import('xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      await import('xterm/css/xterm.css')

      term = new XTerm({
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.5,
        theme: {
          background: '#0e0e10',
          foreground: '#f0f0f2',
          cursor: '#7c6ef8',
          cursorAccent: '#0e0e10',
          black: '#1a1a1f',
          red: '#f56565',
          green: '#3dd68c',
          yellow: '#f6ad55',
          blue: '#7c6ef8',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#f0f0f2',
          brightBlack: '#5a5a6a',
          brightRed: '#fc8181',
          brightGreen: '#68d391',
          brightYellow: '#fbd38d',
          brightBlue: '#a78bfa',
          brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9',
          brightWhite: '#ffffff',
          selectionBackground: 'rgba(124,110,248,0.3)',
        },
        allowTransparency: true,
        scrollback: 5000,
        cursorBlink: true,
        cursorStyle: 'bar',
        convertEol: true,
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      term.open(termRef.current)
      fitAddon.fit()

      xtermRef.current = term
      fitAddonRef.current = fitAddon
      setIsReady(true)

      term.writeln('\x1b[38;5;99m╔═══════════════════════════════════════╗\x1b[0m')
      term.writeln('\x1b[38;5;99m║         Codex GUI — Terminal          ║\x1b[0m')
      term.writeln('\x1b[38;5;99m╚═══════════════════════════════════════╝\x1b[0m')
      term.writeln('')
      term.writeln('\x1b[38;5;245mBereit. Klicke "Terminal starten" um die Shell zu öffnen.\x1b[0m')
      term.writeln('\x1b[38;5;245mDanach kannst du z.B. \x1b[38;5;147mcodex\x1b[38;5;245m eingeben.\x1b[0m')
      term.writeln('')
    }

    init()

    return () => {
      if (term) term.dispose()
    }
  }, [])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = xtermRef.current
        window.api.ptyResize(cols, rows)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const startTerminal = useCallback(async () => {
    if (!folder || isRunning) return

    const result = await window.api.ptyStart(folder)
    if (result.error) {
      xtermRef.current?.writeln(`\x1b[31mFehler: ${result.error}\x1b[0m`)
      return
    }

    setIsRunning(true)

    window.api.onPtyData(data => {
      xtermRef.current?.write(data)
      outputBuffer.current += data
      // Notify parent after quiet period
      clearTimeout(window._diffTimeout)
      window._diffTimeout = setTimeout(() => {
        if (outputBuffer.current.length > 0) {
          onOutput?.()
          outputBuffer.current = ''
        }
      }, 1000)
    })

    window.api.onPtyExit(() => {
      setIsRunning(false)
      xtermRef.current?.writeln('\r\n\x1b[38;5;245m[Shell beendet]\x1b[0m')
      window.api.offPtyData()
      window.api.offPtyExit()
    })

    // Connect keyboard input
    xtermRef.current?.onData(data => {
      window.api.ptyWrite(data)
    })

    // Fit and sync size
    fitAddonRef.current?.fit()
    const { cols, rows } = xtermRef.current
    window.api.ptyResize(cols, rows)

    // Send codex launch hint
    xtermRef.current?.writeln('\x1b[38;5;245m# Tipp: gib "codex" ein um Codex AI zu starten\x1b[0m')
  }, [folder, isRunning, onOutput])

  const stopTerminal = useCallback(async () => {
    await window.api.ptyKill()
    setIsRunning(false)
    window.api.offPtyData()
    window.api.offPtyExit()
  }, [])

  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear()
  }, [])

  const runCodex = useCallback(() => {
    if (!isRunning) return
    window.api.ptyWrite('codex\r')
  }, [isRunning])

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={`${styles.statusIndicator} ${isRunning ? styles.statusOn : ''}`} />
          <span className={styles.toolbarLabel}>
            {isRunning ? 'Shell aktiv' : 'Shell inaktiv'}
          </span>
        </div>

        <div className={styles.toolbarRight}>
          {!isRunning ? (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={startTerminal}
              disabled={!isReady}
            >
              ▶ Terminal starten
            </button>
          ) : (
            <>
              <button
                className={`${styles.btn} ${styles.btnCodex}`}
                onClick={runCodex}
              >
                🤖 Codex starten
              </button>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={clearTerminal}
              >
                Leeren
              </button>
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={stopTerminal}
              >
                ■ Stop
              </button>
            </>
          )}
        </div>
      </div>

      <div ref={containerRef} className={styles.terminalContainer}>
        <div ref={termRef} className={styles.terminal} />
      </div>
    </div>
  )
}
