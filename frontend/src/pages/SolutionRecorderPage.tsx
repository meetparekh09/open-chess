import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import type { Color, ScenarioDetail } from '../api/types'
import { Board } from '../components/Board'
import { SolutionStepper } from '../components/SolutionStepper'
import { useGame } from '../hooks/useGame'
import { describeGoal } from '../lib/chess'

type Mode = 'view' | 'edit'
type Message = { kind: 'error' | 'ok'; text: string }

export function SolutionRecorderPage() {
  const scenarioId = Number(useParams().id)
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [comments, setComments] = useState<string[]>([])
  const [mode, setMode] = useState<Mode>('view')
  const [orientation, setOrientation] = useState<Color>('white')
  const [message, setMessage] = useState<Message | null>(null)
  const [saving, setSaving] = useState(false)
  const game = useGame()
  const { load } = game

  const reload = useCallback(async () => {
    try {
      const loaded = await api.getScenario(scenarioId)
      setScenario(loaded)
      setComments(loaded.solution.map((step) => step.comment))
      setMode(loaded.solution.length ? 'view' : 'edit')
      setOrientation(loaded.player_side)
      await load(
        loaded.start_fen,
        loaded.solution.map((step) => step.move_uci),
      )
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    }
  }, [scenarioId, load])

  useEffect(() => {
    reload()
  }, [reload])

  if (!scenario || !game.current || !game.start) {
    return message ? (
      <p className="page message error">{message.text}</p>
    ) : (
      <p className="page muted">Loading...</p>
    )
  }

  const { cursor, plies } = game
  const saved = scenario.solution
  const dirty =
    saved.length !== plies.length ||
    plies.some(
      (ply, index) => ply.uci !== saved[index].move_uci || (comments[index] ?? '') !== saved[index].comment,
    )

  const play = async (uci: string) => {
    if (plies[cursor]?.uci !== uci) {
      setComments((previous) => previous.slice(0, cursor))
    }
    await game.play(uci)
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.saveSolution(
        scenarioId,
        plies.map((ply, index) => ({ move_uci: ply.uci, comment: comments[index] ?? '' })),
      )
      setScenario(updated)
      setMessage({ kind: 'ok', text: 'Solution saved.' })
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const lastPly = cursor > 0 ? plies[cursor - 1] : null
  const editing = mode === 'edit'

  return (
    <div className="page two-column">
      <section className="board-column">
        <Board
          id="solution"
          position={game.current}
          orientation={orientation}
          onMove={editing && !game.busy ? play : undefined}
          lastMove={lastPly ? { from: lastPly.uci.slice(0, 2), to: lastPly.uci.slice(2, 4) } : null}
        />
        <div className="toolbar">
          <button onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}>
            Flip
          </button>
          {editing && (
            <button
              onClick={() => {
                game.truncate()
                setComments((previous) => previous.slice(0, cursor))
              }}
              disabled={cursor === plies.length}
            >
              Delete moves after here
            </button>
          )}
        </div>
        {game.error && <p className="message error">{game.error}</p>}
      </section>

      <section className="side-column">
        <div className="section-header">
          <h2>Solution: {scenario.title}</h2>
          <div className="links">
            <Link to={`/practice/${scenarioId}`}>Practice</Link>
            <Link to={`/editor/${scenarioId}`}>Edit scenario</Link>
          </div>
        </div>
        <p className="muted">
          {describeGoal(scenario.goal)}. You play {scenario.player_side}.
        </p>

        <div className="tabs">
          <button className={mode === 'view' ? 'active' : ''} onClick={() => setMode('view')}>
            Walk through
          </button>
          <button className={editing ? 'active' : ''} onClick={() => setMode('edit')}>
            Record and edit
          </button>
        </div>
        {editing && (
          <p className="hint-text">
            Play the solution on the board for both sides and explain each move. Going back and
            playing a different move replaces the rest of the line.
          </p>
        )}

        {plies.length === 0 && !editing ? (
          <p className="muted">No solution recorded yet. Switch to "Record and edit" to add one.</p>
        ) : (
          <SolutionStepper
            steps={plies.map((ply, index) => ({ san: ply.san, comment: comments[index] ?? '' }))}
            cursor={cursor}
            startTurn={game.start.turn}
            startMoveNumber={Number(game.start.fen.split(' ')[5] ?? 1)}
            onGoTo={game.goTo}
            onCommentChange={
              editing
                ? (index, comment) =>
                    setComments((previous) => {
                      const next = [...previous]
                      next[index] = comment
                      return next
                    })
                : undefined
            }
          />
        )}

        <div className="toolbar">
          <button className="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving...' : 'Save solution'}
          </button>
          <button disabled={!dirty} onClick={reload}>
            Discard changes
          </button>
        </div>
        {message && <p className={`message ${message.kind}`}>{message.text}</p>}
      </section>
    </div>
  )
}
