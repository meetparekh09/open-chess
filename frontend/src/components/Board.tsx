import { type CSSProperties, useMemo, useState } from 'react'
import { type Arrow, Chessboard, type PieceDropHandlerArgs } from 'react-chessboard'
import type { Color, MoveInfo, PositionInfo } from '../api/types'
import { fenToPlacement, glyph } from '../lib/chess'

interface Props {
  id: string
  position: PositionInfo
  orientation: Color
  /** Omit to make the board read-only. */
  onMove?: (uci: string) => void
  lastMove?: { from: string; to: string } | null
  arrows?: Arrow[]
}

const LAST_MOVE_STYLE: CSSProperties = { background: 'rgba(255, 214, 0, 0.4)' }
const SELECTED_STYLE: CSSProperties = { background: 'rgba(20, 85, 200, 0.45)' }
const CHECK_STYLE: CSSProperties = {
  background: 'radial-gradient(circle, rgba(230, 30, 30, 0.85) 25%, transparent 75%)',
}
const TARGET_STYLE: CSSProperties = {
  background: 'radial-gradient(circle, rgba(0, 0, 0, 0.25) 22%, transparent 24%)',
}
const CAPTURE_STYLE: CSSProperties = {
  background: 'radial-gradient(circle, transparent 58%, rgba(0, 0, 0, 0.25) 60%)',
}

export function Board({ id, position, orientation, onMove, lastMove, arrows = [] }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<MoveInfo[] | null>(null)
  const [fenForSelection, setFenForSelection] = useState(position.fen)
  if (fenForSelection !== position.fen) {
    setFenForSelection(position.fen)
    setSelected(null)
    setPromotion(null)
  }

  const placement = useMemo(() => fenToPlacement(position.fen), [position.fen])
  const turnPrefix = position.turn === 'white' ? 'w' : 'b'

  const movesBetween = (from: string, to: string) =>
    position.legal_moves.filter((move) => move.from_square === from && move.to_square === to)

  const tryMove = (from: string, to: string): boolean => {
    const candidates = movesBetween(from, to)
    if (!onMove || candidates.length === 0) {
      return false
    }
    setSelected(null)
    if (candidates.length > 1) {
      setPromotion(candidates)
      return false
    }
    onMove(candidates[0].uci)
    return true
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    if (lastMove) {
      styles[lastMove.from] = LAST_MOVE_STYLE
      styles[lastMove.to] = LAST_MOVE_STYLE
    }
    if (position.is_check) {
      const king = Object.keys(placement).find((sq) => placement[sq] === `${turnPrefix}K`)
      if (king) {
        styles[king] = CHECK_STYLE
      }
    }
    if (selected) {
      styles[selected] = SELECTED_STYLE
      for (const move of position.legal_moves) {
        if (move.from_square === selected) {
          styles[move.to_square] = placement[move.to_square] ? CAPTURE_STYLE : TARGET_STYLE
        }
      }
    }
    return styles
  }, [lastMove, position, placement, selected, turnPrefix])

  return (
    <div className="board">
      <Chessboard
        options={{
          id,
          position: position.fen,
          boardOrientation: orientation,
          squareStyles,
          arrows,
          allowDragging: !!onMove,
          allowDragOffBoard: false,
          canDragPiece: ({ piece }) => !!onMove && piece.pieceType[0] === turnPrefix,
          onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
            targetSquare ? tryMove(sourceSquare, targetSquare) : false,
          onSquareClick: ({ square, piece }) => {
            if (!onMove) {
              return
            }
            if (selected && selected !== square && tryMove(selected, square)) {
              return
            }
            const ownPiece = piece?.pieceType[0] === turnPrefix
            setSelected(ownPiece && selected !== square ? square : null)
          },
        }}
      />
      {promotion && (
        <div className="promotion">
          <span>Promote to</span>
          {promotion.map((move) => (
            <button
              key={move.uci}
              onClick={() => {
                setPromotion(null)
                onMove?.(move.uci)
              }}
            >
              {glyph(`${turnPrefix}${move.promotion?.toUpperCase()}`)}
            </button>
          ))}
          <button onClick={() => setPromotion(null)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
