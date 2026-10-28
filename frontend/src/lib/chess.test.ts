import { describe, expect, it } from 'vitest'
import {
  EMPTY_FEN,
  START_FEN,
  describeGoal,
  fenCastling,
  fenToPlacement,
  fenTurn,
  formatDuration,
  glyph,
  opposite,
  placementToFen,
  squaresWithPiece,
} from './chess'

describe('fenToPlacement and placementToFen', () => {
  it('round-trips the start position', () => {
    const placement = fenToPlacement(START_FEN)
    expect(placement.e1).toBe('wK')
    expect(placement.d8).toBe('bQ')
    expect(Object.keys(placement)).toHaveLength(32)
    expect(placementToFen(placement)).toBe(START_FEN.split(' ')[0])
  })

  it('handles sparse boards and board-only FENs', () => {
    expect(fenToPlacement('8/8/8/3n4/8/8/8/Q7')).toEqual({ d5: 'bN', a1: 'wQ' })
    expect(placementToFen({ d5: 'bN', a1: 'wQ' })).toBe('8/8/8/3n4/8/8/8/Q7')
    expect(placementToFen({})).toBe(EMPTY_FEN.split(' ')[0])
  })
})

describe('FEN fields', () => {
  it('reads the side to move, defaulting to white', () => {
    expect(fenTurn(START_FEN)).toBe('white')
    expect(fenTurn('8/8/8/3n4/8/8/8/Q7 b - - 0 1')).toBe('black')
    expect(fenTurn('8/8/8/3n4/8/8/8/Q7')).toBe('white')
  })

  it('reads castling rights, defaulting to none', () => {
    expect(fenCastling(START_FEN)).toBe('KQkq')
    expect(fenCastling('8/8/8/3n4/8/8/8/Q7')).toBe('-')
  })
})

describe('squaresWithPiece', () => {
  it('lists matching squares in order', () => {
    const placement = fenToPlacement(START_FEN)
    expect(squaresWithPiece(placement, 'white', 'n')).toEqual(['b1', 'g1'])
    expect(squaresWithPiece(placement, 'black', 'q')).toEqual(['d8'])
    expect(squaresWithPiece({}, 'black', 'k')).toEqual([])
  })
})

describe('describeGoal', () => {
  it('describes every goal type', () => {
    expect(describeGoal({ type: 'free', params: {} })).toBe('Free practice')
    expect(describeGoal({ type: 'capture', params: { color: 'black', piece: 'n' } })).toBe(
      'Capture the black knight',
    )
    expect(
      describeGoal({
        type: 'capture',
        params: { color: 'black', piece: 'n', square: 'd5', max_moves: 1 },
      }),
    ).toBe('Capture the black knight on d5 within 1 move')
    expect(
      describeGoal({ type: 'survive', params: { color: 'white', piece: 'r', max_moves: 10 } }),
    ).toBe('Keep the white rook alive for 10 moves')
    expect(describeGoal({ type: 'checkmate', params: { color: 'black', max_moves: 3 } })).toBe(
      'Black delivers checkmate within 3 moves',
    )
    expect(describeGoal({ type: 'promote', params: { color: 'white' } })).toBe(
      'White promotes a pawn',
    )
  })
})

describe('helpers', () => {
  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(999)).toBe('0:00')
    expect(formatDuration(61_000)).toBe('1:01')
    expect(formatDuration(3_599_999)).toBe('59:59')
    expect(formatDuration(3_600_000)).toBe('60:00')
  })

  it('maps colors and glyphs', () => {
    expect(opposite('white')).toBe('black')
    expect(opposite('black')).toBe('white')
    expect(glyph('wK')).toBe('♔')
    expect(glyph('bP')).toBe('♟')
    expect(glyph('xx')).toBe('?')
  })
})
