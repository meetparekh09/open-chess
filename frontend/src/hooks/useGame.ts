import { useCallback, useMemo, useRef, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { PositionInfo } from '../api/types'

export interface Ply {
  uci: string
  san: string
  position: PositionInfo
}

/** Move history with a cursor; every move is validated by the backend. */
export function useGame() {
  const [start, setStart] = useState<PositionInfo | null>(null)
  const [plies, setPlies] = useState<Ply[]>([])
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mirrors of the line so async callers (e.g. engine replies) never act on a stale render.
  const startRef = useRef<PositionInfo | null>(null)
  const pliesRef = useRef<Ply[]>([])
  const cursorRef = useRef(0)
  const busyRef = useRef(false)

  const current = cursor === 0 ? start : plies[cursor - 1].position
  const moves = useMemo(() => plies.slice(0, cursor).map((ply) => ply.uci), [plies, cursor])

  const commit = useCallback((nextPlies: Ply[], nextCursor: number) => {
    pliesRef.current = nextPlies
    cursorRef.current = nextCursor
    setPlies(nextPlies)
    setCursor(nextCursor)
  }, [])

  const setBusyState = useCallback((value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }, [])

  const load = useCallback(
    async (fen: string, line: string[] = []) => {
      setBusyState(true)
      try {
        const startInfo = await api.validate(fen)
        const loaded: Ply[] = []
        let position = startInfo
        for (const uci of line) {
          const result = await api.move(position.fen, uci)
          loaded.push({ uci: result.uci, san: result.san, position: result.position })
          position = result.position
        }
        startRef.current = startInfo
        setStart(startInfo)
        commit(loaded, 0)
        setError(null)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusyState(false)
      }
    },
    [commit, setBusyState],
  )

  /** Plays a move at the cursor; resolves to the moves up to the new cursor, or null on failure. */
  const play = useCallback(
    async (uci: string): Promise<string[] | null> => {
      const line = pliesRef.current
      const at = cursorRef.current
      const position = at === 0 ? startRef.current : line[at - 1].position
      if (busyRef.current || !position) {
        return null
      }
      const before = line.slice(0, at)
      if (line[at]?.uci === uci) {
        commit(line, at + 1)
        return [...before.map((ply) => ply.uci), uci]
      }
      setBusyState(true)
      try {
        const result = await api.move(position.fen, uci)
        const ply = { uci: result.uci, san: result.san, position: result.position }
        commit([...before, ply], at + 1)
        setError(null)
        return [...before.map((p) => p.uci), ply.uci]
      } catch (err) {
        setError(errorMessage(err))
        return null
      } finally {
        setBusyState(false)
      }
    },
    [commit, setBusyState],
  )

  /**
   * Appends an already validated ply (e.g. an engine reply computed for the line `after`).
   * Returns the new line, or null if the game moved on since `after`.
   */
  const pushPly = useCallback(
    (ply: Ply, after: string[]): string[] | null => {
      const at = cursorRef.current
      const before = pliesRef.current.slice(0, at)
      if (before.length !== after.length || before.some((p, index) => p.uci !== after[index])) {
        return null
      }
      commit([...before, ply], at + 1)
      return [...after, ply.uci]
    },
    [commit],
  )

  const goTo = useCallback(
    (index: number) => commit(pliesRef.current, Math.max(0, Math.min(index, pliesRef.current.length))),
    [commit],
  )

  const reset = useCallback(() => {
    commit([], 0)
    setError(null)
  }, [commit])

  const truncate = useCallback(
    () => commit(pliesRef.current.slice(0, cursorRef.current), cursorRef.current),
    [commit],
  )

  return {
    start,
    plies,
    cursor,
    current,
    moves,
    busy,
    error,
    load,
    play,
    pushPly,
    goTo,
    reset,
    truncate,
  }
}

export type Game = ReturnType<typeof useGame>
