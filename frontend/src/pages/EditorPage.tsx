import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Chessboard, ChessboardProvider, type PieceDropHandlerArgs } from 'react-chessboard'
import { ApiError, api, errorMessage } from '../api/client'
import type { Color, PositionInfo, ScenarioInput } from '../api/types'
import { FenBar } from '../components/FenBar'
import { MetadataForm } from '../components/MetadataForm'
import { PiecePalette } from '../components/PiecePalette'
import {
  EMPTY_FEN,
  START_FEN,
  type Placement,
  fenCastling,
  fenToPlacement,
  placementToFen,
} from '../lib/chess'
import { EMPTY_DRAFT, type ScenarioDraft } from '../lib/scenario'

export interface PracticeState {
  fen: string
  draft: ScenarioDraft
}

type Message = { kind: 'error' | 'ok'; text: string }

export function EditorPage() {
  const { id } = useParams()
  const scenarioId = id ? Number(id) : null
  const navigate = useNavigate()

  const [placement, setPlacement] = useState<Placement>({})
  const [turn, setTurn] = useState<Color>('white')
  const [castling, setCastling] = useState('-')
  const [draft, setDraft] = useState<ScenarioDraft>(EMPTY_DRAFT)
  const [formKey, setFormKey] = useState(0)
  const [orientation, setOrientation] = useState<Color>('white')
  const [selectedSpare, setSelectedSpare] = useState<string | null>(null)
  const [validation, setValidation] = useState<PositionInfo | null>(null)
  const [fenError, setFenError] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [saving, setSaving] = useState(false)

  const fen = `${placementToFen(placement)} ${turn === 'white' ? 'w' : 'b'} ${castling} - 0 1`

  const applyFen = (text: string) => {
    setPlacement(fenToPlacement(text))
    setTurn(text.split(/\s+/)[1] === 'b' ? 'black' : 'white')
    setCastling(fenCastling(text))
  }

  const loadFen = async (text: string) => {
    try {
      applyFen((await api.validate(text)).fen)
      setMessage(null)
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    }
  }

  useEffect(() => {
    if (scenarioId === null) {
      return
    }
    api
      .getScenario(scenarioId)
      .then((scenario) => {
        applyFen(scenario.start_fen)
        setDraft({
          title: scenario.title,
          description: scenario.description,
          notes: scenario.notes,
          player_side: scenario.player_side,
          goal: scenario.goal,
          difficulty: scenario.difficulty,
          tags: scenario.tags,
          source: scenario.source,
          opponent_mode: scenario.opponent_mode,
        })
        setFormKey((key) => key + 1)
        setOrientation(scenario.player_side)
      })
      .catch((error) => setMessage({ kind: 'error', text: errorMessage(error) }))
  }, [scenarioId])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      api.validate(fen).then(
        (info) => {
          if (!cancelled) {
            setValidation(info)
            setFenError(null)
          }
        },
        (error) => {
          if (!cancelled) {
            setValidation(null)
            setFenError(errorMessage(error))
          }
        },
      )
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fen])

  const boardPosition = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(placement).map(([square, pieceType]) => [square, { pieceType }]),
      ),
    [placement],
  )

  const onPieceDrop = ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
    setPlacement((previous) => {
      const next = { ...previous }
      if (!piece.isSparePiece) {
        delete next[sourceSquare]
      }
      if (targetSquare) {
        next[targetSquare] = piece.pieceType
      }
      return next
    })
    return true
  }

  const removePiece = (square: string) =>
    setPlacement((previous) => {
      const next = { ...previous }
      delete next[square]
      return next
    })

  const onSquareClick = ({ square }: { square: string }) => {
    if (!selectedSpare) {
      return
    }
    if (placement[square] === selectedSpare) {
      removePiece(square)
    } else {
      setPlacement((previous) => ({ ...previous, [square]: selectedSpare }))
    }
  }

  const save = async (clearSolution = false): Promise<void> => {
    if (!draft.title.trim()) {
      setMessage({ kind: 'error', text: 'Give the scenario a title before saving.' })
      return
    }
    const input: ScenarioInput = { ...draft, start_fen: fen }
    setSaving(true)
    try {
      const saved = scenarioId
        ? await api.updateScenario(scenarioId, input, clearSolution)
        : await api.createScenario(input)
      setMessage({ kind: 'ok', text: 'Saved.' })
      if (!scenarioId) {
        navigate(`/editor/${saved.id}`, { replace: true })
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        !clearSolution &&
        window.confirm(`${error.message} Save anyway and delete the solution?`)
      ) {
        return save(true)
      }
      setMessage({ kind: 'error', text: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const tryIt = () => {
    const state: PracticeState = { fen: validation?.fen ?? fen, draft }
    navigate('/practice', { state })
  }

  const topColor = orientation === 'white' ? 'b' : 'w'
  const bottomColor = topColor === 'w' ? 'b' : 'w'

  return (
    <div className="page two-column">
      <section className="board-column">
        <ChessboardProvider
          options={{
            id: 'editor',
            position: boardPosition,
            boardOrientation: orientation,
            onPieceDrop,
            onPieceClick: ({ isSparePiece, piece }) => {
              if (isSparePiece) {
                setSelectedSpare((current) =>
                  current === piece.pieceType ? null : piece.pieceType,
                )
              }
            },
            onSquareClick,
            onSquareRightClick: ({ square }) => removePiece(square),
            showAnimations: false,
          }}
        >
          <PiecePalette color={topColor} selected={selectedSpare} />
          <div className="board">
            <Chessboard />
          </div>
          <PiecePalette color={bottomColor} selected={selectedSpare} />
        </ChessboardProvider>
        <p className="hint-text">
          Drag pieces on, off, or around the board. Right-click removes a piece. Click a palette
          piece to place it by clicking squares.
        </p>

        <div className="toolbar">
          <label className="inline">
            To move
            <select value={turn} onChange={(event) => setTurn(event.target.value as Color)}>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
          <button onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}>
            Flip
          </button>
          <button onClick={() => applyFen(EMPTY_FEN)}>Clear</button>
          <button onClick={() => applyFen(START_FEN)}>Start position</button>
        </div>
        <FenBar fen={validation?.fen ?? fen} onLoad={loadFen} />
        {fenError && <p className="message error">{fenError}</p>}
        {validation && validation.warnings.length > 0 && (
          <ul className="warnings">
            {validation.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {validation && !validation.has_legal_moves && (
          <p className="message error">The side to move has no legal moves.</p>
        )}
      </section>

      <section className="side-column">
        <div className="section-header">
          <h2>{scenarioId ? 'Edit scenario' : 'New scenario'}</h2>
          {scenarioId && (
            <div className="links">
              <Link to={`/practice/${scenarioId}`}>Practice</Link>
              <Link to={`/scenarios/${scenarioId}/solution`}>Solution</Link>
            </div>
          )}
        </div>
        <MetadataForm key={formKey} value={draft} placement={placement} onChange={setDraft} />
        <div className="toolbar">
          <button className="primary" disabled={saving || !!fenError} onClick={() => save()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button disabled={!!fenError} onClick={tryIt}>
            Try it without saving
          </button>
        </div>
        {message && <p className={`message ${message.kind}`}>{message.text}</p>}
      </section>
    </div>
  )
}
