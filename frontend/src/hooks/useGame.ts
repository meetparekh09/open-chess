import { useCallback, useMemo, useState } from 'react'
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

  const current = cursor === 0 ? start : plies[cursor - 1].position
  const moves = useMemo(() => plies.slice(0, cursor).map((ply) => ply.uci), [plies, cursor])

  const load = useCallback(async (fen: string, line: string[] = []) => {
    setBusy(true)
    try {
      const startInfo = await api.validate(fen)
      const loaded: Ply[] = []
      let position = startInfo
      for (const uci of line) {
        const result = await api.move(position.fen, uci)
        loaded.push({ uci: result.uci, san: result.san, position: result.position })
        position = result.position
      }
      setStart(startInfo)
      setPlies(loaded)
      setCursor(0)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [])

  /** Plays a move at the cursor; resolves to the moves up to the new cursor, or null on failure. */
  const play = useCallback(
    async (uci: string): Promise<string[] | null> => {
      if (busy || !current) {
        return null
      }
      const before = plies.slice(0, cursor)
      if (plies[cursor]?.uci === uci) {
        setCursor(cursor + 1)
        return [...before.map((ply) => ply.uci), uci]
      }
      setBusy(true)
      try {
        const result = await api.move(current.fen, uci)
        const ply = { uci: result.uci, san: result.san, position: result.position }
        setPlies([...before, ply])
        setCursor(cursor + 1)
        setError(null)
        return [...before.map((p) => p.uci), ply.uci]
      } catch (err) {
        setError(errorMessage(err))
        return null
      } finally {
        setBusy(false)
      }
    },
    [busy, current, plies, cursor],
  )

  const goTo = useCallback(
    (index: number) => setCursor(Math.max(0, Math.min(index, plies.length))),
    [plies.length],
  )

  const reset = useCallback(() => {
    setPlies([])
    setCursor(0)
    setError(null)
  }, [])

  const truncate = useCallback(() => setPlies(plies.slice(0, cursor)), [plies, cursor])

  return { start, plies, cursor, current, moves, busy, error, load, play, goTo, reset, truncate }
}

export type Game = ReturnType<typeof useGame>
