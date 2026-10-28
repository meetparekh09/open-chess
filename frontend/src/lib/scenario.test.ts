import { describe, expect, it } from 'vitest'
import { START_FEN, fenToPlacement } from './chess'
import { defaultGoal } from './scenario'

const QUEEN_VS_KNIGHT = fenToPlacement('8/8/8/3n4/8/8/8/Q7')

describe('defaultGoal', () => {
  it("targets the opponent's most valuable piece for capture goals", () => {
    expect(defaultGoal('capture', 'white', QUEEN_VS_KNIGHT)).toEqual({
      type: 'capture',
      params: { color: 'black', piece: 'n' },
    })
    expect(defaultGoal('capture', 'black', fenToPlacement(START_FEN))).toEqual({
      type: 'capture',
      params: { color: 'white', piece: 'q' },
    })
  })

  it("keeps one of the player's own pieces alive for survive goals", () => {
    expect(defaultGoal('survive', 'black', QUEEN_VS_KNIGHT)).toEqual({
      type: 'survive',
      params: { color: 'black', piece: 'n', max_moves: 10 },
    })
  })

  it('falls back to a knight when the side has no pieces yet', () => {
    expect(defaultGoal('capture', 'white', {}).params.piece).toBe('n')
  })

  it('uses the player side for checkmate and promote goals', () => {
    expect(defaultGoal('checkmate', 'black', QUEEN_VS_KNIGHT)).toEqual({
      type: 'checkmate',
      params: { color: 'black' },
    })
    expect(defaultGoal('promote', 'white', QUEEN_VS_KNIGHT)).toEqual({
      type: 'promote',
      params: { color: 'white' },
    })
  })

  it('has no parameters for free practice', () => {
    expect(defaultGoal('free', 'white', QUEEN_VS_KNIGHT)).toEqual({ type: 'free', params: {} })
  })
})
