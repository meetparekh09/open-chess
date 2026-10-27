import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, api, errorMessage } from '../api/client'
import type {
  Attempt,
  AttemptResult,
  Color,
  EngineMoveResult,
  EngineStatus,
  Goal,
  GoalStatus,
  OpponentMode,
  ScenarioDetail,
} from '../api/types'
import { Board } from '../components/Board'
import { FenBar } from '../components/FenBar'
import { GoalPanel } from '../components/GoalPanel'
import { MoveList } from '../components/MoveList'
import { useGame } from '../hooks/useGame'
import { START_FEN, capitalize, formatDuration, opposite } from '../lib/chess'
import { ENGINE_LABELS, OPPONENT_LABELS } from '../lib/scenario'
import type { PracticeState } from './EditorPage'

interface Setup {
  title: string
  description: string
  fen: string
  goal: Goal
  playerSide: Color
  opponentMode: OpponentMode
}

const FREE_GOAL: Goal = { type: 'free', params: {} }

const THINK_TIMES_MS = [200, 500, 1000, 2000, 3000]
const THINK_TIME_KEY = 'open-chess.think-ms'

function storedThinkMs(): number {
  const value = Number(localStorage.getItem(THINK_TIME_KEY))
  return THINK_TIMES_MS.includes(value) ? value : 1000
}

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
  const [modeOverride, setModeOverride] = useState<OpponentMode | null>(null)
  const [thinkMs, setThinkMs] = useState(storedThinkMs)
  const [engineReply, setEngineReply] = useState<EngineMoveResult | null>(null)
  // Keyed by request so a failure only shows (and stops "Thinking...") for that request.
  const [engineError, setEngineError] = useState<{ key: string; message: string } | null>(null)
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null)

  let setup: Setup | null = null
  if (scenario) {
    setup = {
      title: scenario.title,
      description: scenario.description,
      fen: scenario.start_fen,
      goal: scenario.goal,
      playerSide: scenario.player_side,
      opponentMode: scenario.opponent_mode,
    }
  } else if (scenarioId === null && adHoc) {
    setup = {
      title: adHoc.draft.title || 'Unsaved position',
      description: adHoc.draft.description,
      fen: adHoc.fen,
      goal: adHoc.draft.goal,
      playerSide: adHoc.draft.player_side,
      opponentMode: adHoc.draft.opponent_mode,
    }
  } else if (scenarioId === null) {
    setup = {
      title: 'Free board',
      description: '',
      fen: searchParams.get('fen') ?? START_FEN,
      goal: FREE_GOAL,
      playerSide: 'white',
      opponentMode: 'manual',
    }
  }
  const goal = setup?.goal ?? FREE_GOAL
  const setupFen = setup?.fen
  const setupSide = setup?.playerSide

  const { load, pushPly } = game
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
    api.engineStatus().then(setEngineStatus, () => {})
  }, [])

  useEffect(() => {
    if (setupFen) {
      load(setupFen)
    }
  }, [setupFen, load])
  const playerSide = setupSide ?? 'white'
  const engineSide = opposite(playerSide)
  const orientation = flipped ? engineSide : playerSide

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

  const finishIfDecided = (result: GoalStatus | null, moves: string[], start: number) => {
    if (result && result.status !== 'in_progress') {
      const end = Date.now()
      setOutcome({ result: result.status, detail: result.detail })
      setEndedAt(end)
      saveAttempt(false, moves.slice(0, result.ply_count), start, end)
    }
  }

  const handleMove = async (uci: string) => {
    const start = startedAt ?? Date.now()
    setStartedAt(start)
    if (engineActive) {
      // The opponent must answer the new move, not replay its old reply from the history.
      game.truncate()
    }
    const moves = await game.play(uci)
    if (moves) {
      finishIfDecided(await evaluate(moves), moves, start)
    }
  }

  const acceptEngineReply = useEffectEvent((reply: EngineMoveResult, after: string[]) => {
    const moves = pushPly({ uci: reply.uci, san: reply.san, position: reply.position }, after)
    if (!moves) {
      return null
    }
    setEngineReply(reply)
    const start = startedAt ?? Date.now()
    setStartedAt(start)
    return { moves, start }
  })
  const settleAfterEngine = useEffectEvent(finishIfDecided)

  const mode = modeOverride ?? setup?.opponentMode ?? 'manual'
  const engineActive = mode !== 'manual'
  const movesKey = game.moves.join(' ')
  const requestKey = `${mode}|${thinkMs}|${movesKey}`
  const engineTurn =
    engineActive &&
    !outcome &&
    !game.busy &&
    game.current !== null &&
    game.cursor === game.plies.length &&
    game.current.turn === engineSide &&
    game.current.has_legal_moves
  const thinking = engineTurn && engineError?.key !== requestKey

  useEffect(() => {
    if (!engineTurn || !startFen) {
      return
    }
    let cancelled = false
    const moves = movesKey ? movesKey.split(' ') : []
    api.engineMove(startFen, moves, JSON.parse(goalKey) as Goal, mode, thinkMs).then(
      async (reply) => {
        // Accepting the reply changes the line, which re-runs this effect, so `cancelled`
        // only guards the reply itself.
        const accepted = cancelled ? null : acceptEngineReply(reply, moves)
        if (accepted) {
          settleAfterEngine(await evaluate(accepted.moves), accepted.moves, accepted.start)
        }
      },
      (error) => {
        if (!cancelled) {
          // 409: the attempt was just decided by the previous move; the outcome shows that.
          const decided = error instanceof ApiError && error.status === 409
          setEngineError({ key: requestKey, message: decided ? '' : errorMessage(error) })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [engineTurn, startFen, movesKey, goalKey, mode, thinkMs, requestKey, evaluate])

  const changeThinkTime = (value: number) => {
    setThinkMs(value)
    localStorage.setItem(THINK_TIME_KEY, String(value))
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
    setEngineReply(null)
    setEngineError(null)
    savingRef.current = false
  }

  const { goTo, cursor } = game
  const turnAt = (index: number) =>
    index === 0 ? game.start?.turn : game.plies[index - 1]?.position.turn
  // With a computer opponent, undo goes back to your previous turn (never before its opening move).
  const firstPlayerPly = engineActive && game.start?.turn === engineSide ? 1 : 0
  const skipEngineReply =
    engineActive && !outcome && cursor - 1 > firstPlayerPly && turnAt(cursor - 1) === engineSide
  const undoTarget = skipEngineReply ? cursor - 2 : cursor - 1
  const canUndo = undoTarget >= (engineActive && !outcome ? firstPlayerPly : 0)
  const undo = () => {
    if (canUndo) {
      goTo(undoTarget)
    }
  }
  const canRedo = cursor < game.plies.length && !game.busy && (!engineActive || !!outcome)
  // Redo replays the move during an attempt so a decisive move still ends it.
  const redo = () => {
    const next = game.plies[cursor]
    if (!next || !canRedo) {
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
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.key === 'ArrowLeft') {
        undo()
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
          onMove={
            !outcome && !game.busy && !thinking && (!engineActive || game.current.turn === playerSide)
              ? handleMove
              : undefined
          }
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
          <button onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button onClick={redo} disabled={!canRedo}>
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
          You play {setup.playerSide}.{' '}
          {engineActive ? `The computer plays ${engineSide}.` : 'Move both sides yourself.'}{' '}
          {capitalize(game.current.turn)} to move.
          {cursor < game.plies.length && ' (Reviewing earlier position.)'}
        </p>

        <div className="form-row">
          <label>
            Opponent
            <select
              value={mode}
              onChange={(event) => setModeOverride(event.target.value as OpponentMode)}
            >
              {Object.entries(OPPONENT_LABELS).map(([value, label]) => {
                const missing = value === 'stockfish' && engineStatus?.stockfish_available === false
                return (
                  <option key={value} value={value} disabled={missing}>
                    {label}
                    {missing ? ' (not installed)' : ''}
                  </option>
                )
              })}
            </select>
          </label>
          <label>
            Think time
            <select
              value={thinkMs}
              disabled={!engineActive}
              onChange={(event) => changeThinkTime(Number(event.target.value))}
            >
              {THINK_TIMES_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {ms / 1000}s
                </option>
              ))}
            </select>
          </label>
        </div>
        {engineActive && (thinking || engineReply) && (
          <p className="muted">
            {thinking
              ? 'Thinking...'
              : engineReply &&
                `${ENGINE_LABELS[engineReply.engine]} played ${engineReply.san}` +
                  `${engineReply.depth ? ` (depth ${engineReply.depth})` : ''}. ${engineReply.note}`}
          </p>
        )}
        {engineError?.message && engineError.key === requestKey && (
          <p className="message error">{engineError.message}</p>
        )}

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
