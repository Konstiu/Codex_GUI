import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './Terminal.module.css'

export default function Terminal({ folder, onOutput }) {
  const termRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const containerRef = useRef(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [codexState, setCodexState] = useState('idle') // idle | starting | running | stopped | missing
  const outputBuffer = useRef('')
  const isRunningRef = useRef(false)
  const initGenerationRef = useRef(0)
  const codexStateRef = useRef('idle')
  const codexStartTimerRef = useRef(null)
  const codexMissingAnnouncedRef = useRef(false)

  const syncCodexState = useCallback((next) => {
    codexStateRef.current = next
    setCodexState(next)
  }, [])

  const launchCodex = useCallback(() => {
    if (!isRunningRef.current) return
    if (codexStartTimerRef.current) clearTimeout(codexStartTimerRef.current)
    codexMissingAnnouncedRef.current = false
    syncCodexState('starting')
    xtermRef.current?.writeln('\x1b[38;5;245m# Starte codex…\x1b[0m')
    window.api.ptyWrite('codex\r')

    // If no immediate shell error appears, assume codex started.
    codexStartTimerRef.current = setTimeout(() => {
      if (codexStateRef.current === 'starting') {
        syncCodexState('running')
      }
      codexStartTimerRef.current = null
    }, 1200)
  }, [syncCodexState])
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
      term.writeln('\x1b[38;5;245mBereit. Klicke "Codex starten" um direkt loszulegen.\x1b[0m')
      term.writeln('')
    }

    init()

    return () => {
      disposed = true
      if (codexStartTimerRef.current) clearTimeout(codexStartTimerRef.current)
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

  const startTerminal = useCallback(async ({ autoRunCodex = false } = {}) => {
    if (!folder || isRunningRef.current) return

    // Register listeners before spawning PTY to avoid missing early events.
    window.api.offPtyData()
    window.api.offPtyExit()
    window.api.onPtyData(data => {
      xtermRef.current?.write(data)
      xtermRef.current?.scrollToBottom()
      outputBuffer.current += data

      const missingCodexRegex = /(command not found:\s*codex|codex: command not found|not recognized as an internal or external command)/i
      if (missingCodexRegex.test(data)) {
        if (!codexMissingAnnouncedRef.current) {
          xtermRef.current?.writeln('\r\n\x1b[31m[Fehler] Codex ist nicht installiert oder nicht im PATH.\x1b[0m')
          xtermRef.current?.writeln('\x1b[38;5;245mInstalliere z.B. mit: npm install -g @openai/codex\x1b[0m')
          codexMissingAnnouncedRef.current = true
        }
        if (codexStartTimerRef.current) {
          clearTimeout(codexStartTimerRef.current)
          codexStartTimerRef.current = null
        }
        syncCodexState('missing')
      }

      // If prompt reappears while codex was running/starting, codex is no longer active.
      const shellPromptRegex = /(^|\n)[^\n]{0,160}(\$|#|%)\s$/m
      if ((codexStateRef.current === 'running' || codexStateRef.current === 'starting') && shellPromptRegex.test(data)) {
        if (codexStartTimerRef.current) {
          clearTimeout(codexStartTimerRef.current)
          codexStartTimerRef.current = null
        }
        if (codexStateRef.current !== 'missing') syncCodexState('stopped')
      }

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
      if (codexStartTimerRef.current) {
        clearTimeout(codexStartTimerRef.current)
        codexStartTimerRef.current = null
      }
      syncCodexState('idle')
      xtermRef.current?.writeln('\r\n\x1b[38;5;245m[Shell beendet]\x1b[0m')
      window.api.offPtyData()
      window.api.offPtyExit()
    })

    const result = await window.api.ptyStart(folder)
    if (result.error) {
      isRunningRef.current = false
      setIsRunning(false)
      syncCodexState('idle')
      xtermRef.current?.writeln(`\x1b[31mFehler: ${result.error}\x1b[0m`)
      window.api.offPtyData()
      window.api.offPtyExit()
      return
    }

    isRunningRef.current = true
    setIsRunning(true)
    syncCodexState('stopped')

    // Fit and sync size
    fitAddonRef.current?.fit()
    const { cols, rows } = xtermRef.current
    window.api.ptyResize(cols, rows)
    focusTerminal()
    xtermRef.current?.scrollToBottom()
    window.api.ptyWrite('\r')
    if (autoRunCodex) {
      launchCodex()
    }
  }, [folder, onOutput, focusTerminal, syncCodexState, launchCodex])

  const stopTerminal = useCallback(async () => {
    await window.api.ptyKill()
    isRunningRef.current = false
    setIsRunning(false)
    if (codexStartTimerRef.current) {
      clearTimeout(codexStartTimerRef.current)
      codexStartTimerRef.current = null
    }
    syncCodexState('idle')
    window.api.offPtyData()
    window.api.offPtyExit()
  }, [syncCodexState])

  const restartCodex = useCallback(async () => {
    if (isRunningRef.current) {
      await stopTerminal()
      // Give PTY bridge a short moment to tear down before respawn.
      await new Promise(resolve => setTimeout(resolve, 120))
    }
    await startTerminal({ autoRunCodex: true })
  }, [startTerminal, stopTerminal])

  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear()
    xtermRef.current?.scrollToBottom()
    focusTerminal()
  }, [focusTerminal])

  const runCodex = useCallback(() => {
    if (isRunning) {
      launchCodex()
      return
    }
    startTerminal({ autoRunCodex: true })
  }, [isRunning, startTerminal, launchCodex])

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={`${styles.statusIndicator} ${isRunning ? styles.statusOn : ''}`} />
          <span className={styles.toolbarLabel}>
            {!isRunning
              ? 'Shell inaktiv'
              : codexState === 'running'
                ? 'Shell aktiv · Codex läuft'
                : codexState === 'starting'
                  ? 'Shell aktiv · Codex startet…'
                  : codexState === 'missing'
                    ? 'Shell aktiv · Codex fehlt'
                    : 'Shell aktiv · Codex gestoppt'}
          </span>
        </div>

        <div className={styles.toolbarRight}>
          {!isRunning ? (
            <>
              <button
                className={`${styles.btn} ${styles.btnCodex}`}
                onClick={runCodex}
                disabled={!isReady}
              >
                🤖 Codex starten
              </button>
            </>
          ) : (
            <>
              <button
                className={`${styles.btn} ${styles.btnCodex}`}
                onClick={runCodex}
              >
                🤖 Codex starten
              </button>
              {codexState !== 'running' && (
                <button
                  className={`${styles.btn} ${styles.btnRestart}`}
                  onClick={restartCodex}
                >
                  ↻ Neustart
                </button>
              )}
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
