import type {
  Color,
  EngineName,
  Goal,
  GoalType,
  OpponentMode,
  PieceLetter,
  ScenarioInput,
} from '../api/types'
import { type Placement, opposite, squaresWithPiece } from './chess'

export type ScenarioDraft = Omit<ScenarioInput, 'start_fen'>

export const OPPONENT_LABELS: Record<OpponentMode, string> = {
  manual: 'Manual (move both sides)',
  auto: 'Computer: auto',
  goal_search: 'Computer: goal search',
  stockfish: 'Computer: Stockfish',
}

export const ENGINE_LABELS: Record<EngineName, string> = {
  goal_search: 'Goal search',
  stockfish: 'Stockfish',
}

export const EMPTY_DRAFT: ScenarioDraft = {
  title: '',
  description: '',
  notes: '',
  player_side: 'white',
  goal: { type: 'free', params: {} },
  difficulty: 3,
  tags: [],
  source: '',
  opponent_mode: 'manual',
}

export const PIECE_LETTERS: PieceLetter[] = ['q', 'r', 'b', 'n', 'p', 'k']

function firstPiece(placement: Placement, color: Color): PieceLetter {
  return (
    PIECE_LETTERS.find((piece) => squaresWithPiece(placement, color, piece).length > 0) ?? 'n'
  )
}

/** Sensible goal parameters for a goal type, given who the player is and what is on the board. */
export function defaultGoal(type: GoalType, playerSide: Color, placement: Placement): Goal {
  switch (type) {
    case 'capture': {
      const color = opposite(playerSide)
      return { type, params: { color, piece: firstPiece(placement, color) } }
    }
    case 'survive':
      return {
        type,
        params: { color: playerSide, piece: firstPiece(placement, playerSide), max_moves: 10 },
      }
    case 'checkmate':
    case 'promote':
      return { type, params: { color: playerSide } }
    default:
      return { type: 'free', params: {} }
  }
}
