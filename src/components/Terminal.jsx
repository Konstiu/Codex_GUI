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
  const isRunningRef = useRef(false)
  const initGenerationRef = useRef(0)
  const focusTerminal = useCallback(() => {
    xtermRef.current?.focus()
    termRef.current?.querySelector('textarea')?.focus()
  }, [])

  // Initialize xterm.js
  useEffect(() => {
    let term
    let fitAddon
    let disposed = false
    const generation = ++initGenerationRef.current

    const init = async () => {
      const { Terminal: XTerm } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      await import('@xterm/xterm/css/xterm.css')
      if (disposed || generation !== initGenerationRef.current || !termRef.current) return

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
        disableStdin: false,
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      term.open(termRef.current)
      fitAddon.fit()
      focusTerminal()
      if (disposed || generation !== initGenerationRef.current) {
        term.dispose()
        return
      }

      xtermRef.current = term
      fitAddonRef.current = fitAddon
      setIsReady(true)

      // Keep a single keyboard handler for the terminal lifetime.
      // `onKey` is more reliable than `onData` for some Linux/Electron setups.
      term.onKey(({ key }) => {
        if (!isRunningRef.current) return
        window.api.ptyWrite(key)
        xtermRef.current?.scrollToBottom()
      })

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
      disposed = true
      if (term) term.dispose()
    }
  }, [focusTerminal])

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

    // Register listeners before spawning PTY to avoid missing early events.
    window.api.offPtyData()
    window.api.offPtyExit()
    window.api.onPtyData(data => {
      xtermRef.current?.write(data)
      xtermRef.current?.scrollToBottom()
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
      isRunningRef.current = false
      setIsRunning(false)
      xtermRef.current?.writeln('\r\n\x1b[38;5;245m[Shell beendet]\x1b[0m')
      window.api.offPtyData()
      window.api.offPtyExit()
    })

    const result = await window.api.ptyStart(folder)
    if (result.error) {
      isRunningRef.current = false
      setIsRunning(false)
      xtermRef.current?.writeln(`\x1b[31mFehler: ${result.error}\x1b[0m`)
      window.api.offPtyData()
      window.api.offPtyExit()
      return
    }

    isRunningRef.current = true
    setIsRunning(true)

    // Fit and sync size
    fitAddonRef.current?.fit()
    const { cols, rows } = xtermRef.current
    window.api.ptyResize(cols, rows)
    focusTerminal()
    xtermRef.current?.scrollToBottom()
    window.api.ptyWrite('\r')

    // Send codex launch hint
    xtermRef.current?.writeln('\x1b[38;5;245m# Tipp: gib "codex" ein um Codex AI zu starten\x1b[0m')
  }, [folder, isRunning, onOutput, focusTerminal])

  const stopTerminal = useCallback(async () => {
    await window.api.ptyKill()
    isRunningRef.current = false
    setIsRunning(false)
    window.api.offPtyData()
    window.api.offPtyExit()
  }, [])

  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear()
    xtermRef.current?.scrollToBottom()
    focusTerminal()
  }, [focusTerminal])

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
        <div
          ref={termRef}
          className={styles.terminal}
          onClick={focusTerminal}
        />
      </div>
    </div>
  )
}
