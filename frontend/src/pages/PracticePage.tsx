import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import type { Attempt, AttemptResult, Color, Goal, GoalStatus, ScenarioDetail } from '../api/types'
import { Board } from '../components/Board'
import { FenBar } from '../components/FenBar'
import { GoalPanel } from '../components/GoalPanel'
import { MoveList } from '../components/MoveList'
import { useGame } from '../hooks/useGame'
import { START_FEN, capitalize, formatDuration, opposite } from '../lib/chess'
import type { PracticeState } from './EditorPage'

interface Setup {
  title: string
  description: string
  fen: string
  goal: Goal
  playerSide: Color
}

const FREE_GOAL: Goal = { type: 'free', params: {} }

const RESULT_LABELS: Record<AttemptResult, string> = {
  success: 'Success',
  fail: 'Failed',
  abandoned: 'Gave up',
}

export function PracticePage() {
  const { id } = useParams()
  const scenarioId = id ? Number(id) : null
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const adHoc = location.state as PracticeState | null

  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const game = useGame()
  const [flipped, setFlipped] = useState(false)
  const [status, setStatus] = useState<GoalStatus | null>(null)
  const [outcome, setOutcome] = useState<{ result: AttemptResult; detail: string } | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endedAt, setEndedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [hintPly, setHintPly] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savingRef = useRef(false)

  let setup: Setup | null = null
  if (scenario) {
    setup = {
      title: scenario.title,
      description: scenario.description,
      fen: scenario.start_fen,
      goal: scenario.goal,
      playerSide: scenario.player_side,
    }
  } else if (scenarioId === null && adHoc) {
    setup = {
      title: adHoc.draft.title || 'Unsaved position',
      description: adHoc.draft.description,
      fen: adHoc.fen,
      goal: adHoc.draft.goal,
      playerSide: adHoc.draft.player_side,
    }
  } else if (scenarioId === null) {
    setup = {
      title: 'Free board',
      description: '',
      fen: searchParams.get('fen') ?? START_FEN,
      goal: FREE_GOAL,
      playerSide: 'white',
    }
  }
  const goal = setup?.goal ?? FREE_GOAL
  const setupFen = setup?.fen
  const setupSide = setup?.playerSide

  const { load } = game
  useEffect(() => {
    if (scenarioId === null) {
      return
    }
    api
      .getScenario(scenarioId)
      .then(setScenario)
      .catch((error) => setLoadError(errorMessage(error)))
    api.listAttempts(scenarioId).then(setAttempts, () => {})
  }, [scenarioId])

  useEffect(() => {
    if (setupFen) {
      load(setupFen)
    }
  }, [setupFen, load])
  const playerSide = setupSide ?? 'white'
  const orientation = flipped ? opposite(playerSide) : playerSide

  const startFen = game.start?.fen
  const goalKey = JSON.stringify(goal)
  const evaluate = useCallback(
    async (moves: string[]): Promise<GoalStatus | null> => {
      const parsedGoal = JSON.parse(goalKey) as Goal
      if (!startFen || parsedGoal.type === 'free') {
        return null
      }
      try {
        return await api.evaluateGoal(startFen, parsedGoal, moves)
      } catch (error) {
        setLoadError(errorMessage(error))
        return null
      }
    },
    [startFen, goalKey],
  )

  useEffect(() => {
    let cancelled = false
    evaluate(game.moves).then((result) => !cancelled && setStatus(result))
    return () => {
      cancelled = true
    }
  }, [evaluate, game.moves])

  useEffect(() => {
    if (startedAt === null || endedAt !== null) {
      return
    }
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [startedAt, endedAt])

  const saveAttempt = async (abandoned: boolean, moves: string[], start: number, end: number) => {
    if (scenarioId === null || savingRef.current || moves.length === 0) {
      return
    }
    savingRef.current = true
    try {
      const attempt = await api.recordAttempt(scenarioId, {
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
        moves,
        abandoned,
      })
      setAttempts((previous) => [attempt, ...previous])
      setSaveError(null)
      setScenario(await api.getScenario(scenarioId))
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }

  const handleMove = async (uci: string) => {
    const start = startedAt ?? Date.now()
    setStartedAt(start)
    const moves = await game.play(uci)
    if (!moves) {
      return
    }
    const result = await evaluate(moves)
    if (result && result.status !== 'in_progress') {
      const end = Date.now()
      setOutcome({ result: result.status, detail: result.detail })
      setEndedAt(end)
      saveAttempt(false, moves.slice(0, result.ply_count), start, end)
    }
  }

  const giveUp = () => {
    const end = Date.now()
    setOutcome({ result: 'abandoned', detail: 'You stopped this attempt.' })
    setEndedAt(end)
    if (startedAt !== null) {
      saveAttempt(true, game.moves, startedAt, end)
    }
  }

  const restart = () => {
    game.reset()
    setOutcome(null)
    setStartedAt(null)
    setEndedAt(null)
    setHintPly(null)
    setSaveError(null)
    savingRef.current = false
  }

  const { goTo, cursor } = game
  // Redo replays the move during an attempt so a decisive move still ends it.
  const redo = () => {
    const next = game.plies[cursor]
    if (!next) {
      return
    }
    if (outcome) {
      goTo(cursor + 1)
    } else {
      handleMove(next.uci)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (event.key === 'ArrowLeft') {
        goTo(cursor - 1)
      } else if (event.key === 'ArrowRight') {
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loadError && !setup) {
    return <p className="message error page">{loadError}</p>
  }
  if (!setup || !game.current || !game.start) {
    return <p className="page muted">Loading...</p>
  }

  const solution = scenario?.solution ?? []
  const onSolutionLine = game.moves.every((uci, index) => solution[index]?.move_uci === uci)
  const nextStep = onSolutionLine ? solution[cursor] : undefined
  const hint = hintPly === cursor ? nextStep : undefined
  const lastPly = cursor > 0 ? game.plies[cursor - 1] : null
  const elapsed = startedAt === null ? 0 : (endedAt ?? now) - startedAt
  const moveCount = game.moves.length
  const best = scenario?.stats.best
  const shownStatus: GoalStatus | null =
    goal.type === 'free'
      ? { status: 'in_progress', detail: 'Free practice.', moves_used: moveCount, ply_count: moveCount }
      : status

  return (
    <div className="page two-column">
      <section className="board-column">
        <Board
          id="practice"
          position={game.current}
          orientation={orientation}
          onMove={!outcome && !game.busy ? handleMove : undefined}
          lastMove={lastPly ? { from: lastPly.uci.slice(0, 2), to: lastPly.uci.slice(2, 4) } : null}
          arrows={
            hint
              ? [
                  {
                    startSquare: hint.move_uci.slice(0, 2),
                    endSquare: hint.move_uci.slice(2, 4),
                    color: 'rgba(0, 140, 60, 0.8)',
                  },
                ]
              : []
          }
        />
        <div className="toolbar">
          <button onClick={() => goTo(0)} disabled={cursor === 0}>
            |&lt;
          </button>
          <button onClick={() => goTo(cursor - 1)} disabled={cursor === 0}>
            Undo
          </button>
          <button onClick={redo} disabled={cursor === game.plies.length || game.busy}>
            Redo
          </button>
          <button onClick={() => setFlipped(!flipped)}>Flip</button>
          <button onClick={restart}>{outcome ? 'Try again' : 'Reset'}</button>
          {!outcome && moveCount > 0 && <button onClick={giveUp}>Give up</button>}
        </div>
        <FenBar fen={game.current.fen} />
        {game.error && <p className="message error">{game.error}</p>}
        {game.start.warnings.length > 0 && (
          <ul className="warnings">
            {game.start.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="side-column">
        <div className="section-header">
          <h2>{setup.title}</h2>
          {scenarioId !== null && (
            <div className="links">
              <Link to={`/editor/${scenarioId}`}>Edit</Link>
              <Link to={`/scenarios/${scenarioId}/solution`}>Solution</Link>
            </div>
          )}
        </div>
        {setup.description && <p>{setup.description}</p>}
        <p className="muted">
          You play {setup.playerSide}. Move both sides yourself. {capitalize(game.current.turn)} to
          move.
          {cursor < game.plies.length && ' (Reviewing earlier position.)'}
        </p>

        <GoalPanel goal={goal} status={shownStatus} outcome={outcome} elapsedMs={elapsed} />
        {outcome && scenarioId === null && (
          <p className="muted">Save the scenario to keep a history of attempts.</p>
        )}
        {saveError && <p className="message error">Could not save attempt: {saveError}</p>}

        {scenarioId !== null && (
          <div className="hint-box">
            <button
              onClick={() => setHintPly(cursor)}
              disabled={solution.length === 0 || !nextStep}
            >
              Hint
            </button>
            <span className="muted">
              {solution.length === 0
                ? 'No solution recorded yet.'
                : !onSolutionLine
                  ? 'You have left the recorded solution line.'
                  : !nextStep
                    ? 'End of the recorded solution.'
                    : hint
                      ? `${hint.san}${hint.comment ? `: ${hint.comment}` : ''}`
                      : 'Shows the next move of the recorded solution.'}
            </span>
          </div>
        )}

        <h3>Moves</h3>
        <MoveList
          sans={game.plies.map((ply) => ply.san)}
          cursor={cursor}
          startTurn={game.start.turn}
          startMoveNumber={Number(game.start.fen.split(' ')[5] ?? 1)}
          onSelect={goTo}
        />

        {scenarioId !== null && (
          <>
            <h3>Attempts</h3>
            {best && (
              <p>
                Best: {goal.type === 'survive' ? 'survived' : 'solved in'} {best.moves_used}{' '}
                {best.moves_used === 1 ? 'move' : 'moves'} ({formatDuration(best.duration_ms)})
              </p>
            )}
            {attempts.length === 0 ? (
              <p className="muted">No attempts yet.</p>
            ) : (
              <table className="attempts">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Result</th>
                    <th>Moves</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.slice(0, 10).map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{new Date(attempt.started_at).toLocaleString()}</td>
                      <td className={`result ${attempt.result}`}>{RESULT_LABELS[attempt.result]}</td>
                      <td>{attempt.moves_used}</td>
                      <td>{formatDuration(attempt.duration_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  )
}
