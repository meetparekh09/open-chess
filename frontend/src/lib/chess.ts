import type { Color, Goal, GoalType, PieceLetter } from '../api/types'

/** Square -> piece code such as "wQ" or "bN". */
export type Placement = Record<string, string>

export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const FILES = 'abcdefgh'

export const PIECE_NAMES: Record<PieceLetter, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

export const PIECE_CODES = ['K', 'Q', 'R', 'B', 'N', 'P'] as const

export const GOAL_LABELS: Record<GoalType, string> = {
  free: 'Free practice',
  capture: 'Capture a piece',
  survive: 'Keep a piece alive',
  checkmate: 'Checkmate',
  promote: 'Promote a pawn',
}

const GLYPHS: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

export function glyph(code: string): string {
  return GLYPHS[code] ?? '?'
}

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function fenToPlacement(fen: string): Placement {
  const placement: Placement = {}
  const rows = fen.trim().split(/\s+/)[0].split('/')
  rows.forEach((row, rowIndex) => {
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
      } else {
        const color = char === char.toUpperCase() ? 'w' : 'b'
        placement[`${FILES[file]}${8 - rowIndex}`] = `${color}${char.toUpperCase()}`
        file += 1
      }
    }
  })
  return placement
}

export function placementToFen(placement: Placement): string {
  const rows: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (const file of FILES) {
      const code = placement[`${file}${rank}`]
      if (!code) {
        empty += 1
        continue
      }
      if (empty) {
        row += empty
        empty = 0
      }
      row += code[0] === 'w' ? code[1] : code[1].toLowerCase()
    }
    rows.push(empty ? row + empty : row)
  }
  return rows.join('/')
}

export function fenTurn(fen: string): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white'
}

export function fenCastling(fen: string): string {
  return fen.trim().split(/\s+/)[2] ?? '-'
}

export function squaresWithPiece(placement: Placement, color: Color, piece: PieceLetter): string[] {
  const code = `${color === 'white' ? 'w' : 'b'}${piece.toUpperCase()}`
  return Object.keys(placement)
    .filter((square) => placement[square] === code)
    .sort()
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function describeGoal(goal: Goal): string {
  const { color, piece, square, max_moves: maxMoves } = goal.params
  const target = piece ? `${color} ${PIECE_NAMES[piece]}${square ? ` on ${square}` : ''}` : ''
  const within = maxMoves ? ` within ${plural(maxMoves, 'move')}` : ''
  switch (goal.type) {
    case 'capture':
      return `Capture the ${target}${within}`
    case 'survive':
      return `Keep the ${target} alive for ${plural(maxMoves ?? 0, 'move')}`
    case 'checkmate':
      return `${capitalize(color ?? 'white')} delivers checkmate${within}`
    case 'promote':
      return `${capitalize(color ?? 'white')} promotes a pawn${within}`
    default:
      return 'Free practice'
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
