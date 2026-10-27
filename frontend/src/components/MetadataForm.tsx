import { useState } from 'react'
import type { Color, GoalParams, GoalType, OpponentMode, PieceLetter } from '../api/types'
import {
  GOAL_LABELS,
  PIECE_NAMES,
  type Placement,
  capitalize,
  squaresWithPiece,
} from '../lib/chess'
import { OPPONENT_LABELS, PIECE_LETTERS, type ScenarioDraft, defaultGoal } from '../lib/scenario'

interface Props {
  value: ScenarioDraft
  placement: Placement
  onChange: (draft: ScenarioDraft) => void
}

function numberOrNull(text: string): number | null {
  const value = Number.parseInt(text, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function MetadataForm({ value, placement, onChange }: Props) {
  // Free text so commas can be typed; remount the form (via `key`) to reload tags.
  const [tagText, setTagText] = useState(value.tags.join(', '))

  const set = <K extends keyof ScenarioDraft>(key: K, field: ScenarioDraft[K]) =>
    onChange({ ...value, [key]: field })
  const setParams = (params: Partial<GoalParams>) =>
    set('goal', { ...value.goal, params: { ...value.goal.params, ...params } })

  const { goal } = value
  const targetGoal = goal.type === 'capture' || goal.type === 'survive'
  const targetSquares =
    targetGoal && goal.params.color && goal.params.piece
      ? squaresWithPiece(placement, goal.params.color, goal.params.piece)
      : []

  return (
    <div className="form">
      <label>
        Title
        <input
          value={value.title}
          placeholder="Queen hunts knight"
          onChange={(event) => set('title', event.target.value)}
        />
      </label>
      <label>
        Description
        <textarea
          rows={2}
          value={value.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </label>

      <div className="form-row">
        <label>
          You play
          <select
            value={value.player_side}
            onChange={(event) => {
              const side = event.target.value as Color
              onChange({ ...value, player_side: side, goal: defaultGoal(goal.type, side, placement) })
            }}
          >
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <label>
          Difficulty
          <select
            value={value.difficulty}
            onChange={(event) => set('difficulty', Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {'★'.repeat(level)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Opponent
        <select
          value={value.opponent_mode}
          onChange={(event) => set('opponent_mode', event.target.value as OpponentMode)}
        >
          {Object.entries(OPPONENT_LABELS).map(([mode, label]) => (
            <option key={mode} value={mode}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Goal</legend>
        <label>
          Type
          <select
            value={goal.type}
            onChange={(event) =>
              set('goal', defaultGoal(event.target.value as GoalType, value.player_side, placement))
            }
          >
            {Object.entries(GOAL_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {goal.type !== 'free' && (
          <div className="form-row">
            <label>
              {targetGoal ? 'Target color' : 'Side'}
              <select
                value={goal.params.color ?? ''}
                onChange={(event) =>
                  setParams({ color: event.target.value as Color, square: null })
                }
              >
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </label>
            {targetGoal && (
              <>
                <label>
                  Piece
                  <select
                    value={goal.params.piece ?? ''}
                    onChange={(event) =>
                      setParams({ piece: event.target.value as PieceLetter, square: null })
                    }
                  >
                    {PIECE_LETTERS.map((piece) => (
                      <option key={piece} value={piece}>
                        {capitalize(PIECE_NAMES[piece])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Which one
                  <select
                    value={goal.params.square ?? ''}
                    onChange={(event) => setParams({ square: event.target.value || null })}
                  >
                    <option value="">All of them</option>
                    {targetSquares.map((square) => (
                      <option key={square} value={square}>
                        On {square}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              {goal.type === 'survive' ? 'Moves to survive' : 'Move limit'}
              <input
                type="number"
                min={1}
                placeholder={goal.type === 'survive' ? '' : 'none'}
                value={goal.params.max_moves ?? ''}
                onChange={(event) => setParams({ max_moves: numberOrNull(event.target.value) })}
              />
            </label>
          </div>
        )}
      </fieldset>

      <label>
        Tags
        <input
          value={tagText}
          placeholder="endgame, queen, drill"
          onChange={(event) => {
            setTagText(event.target.value)
            set('tags', parseTags(event.target.value))
          }}
        />
      </label>
      <label>
        Source
        <input
          value={value.source}
          placeholder="Book, game, or idea this came from"
          onChange={(event) => set('source', event.target.value)}
        />
      </label>
      <label>
        Notes
        <textarea rows={3} value={value.notes} onChange={(event) => set('notes', event.target.value)} />
      </label>
    </div>
  )
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}
