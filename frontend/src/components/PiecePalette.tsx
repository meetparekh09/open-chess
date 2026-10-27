import { SparePiece } from 'react-chessboard'
import { PIECE_CODES } from '../lib/chess'

interface Props {
  color: 'w' | 'b'
  selected: string | null
}

/** Draggable spare pieces; must be rendered inside a ChessboardProvider. */
export function PiecePalette({ color, selected }: Props) {
  return (
    <div className="palette">
      {PIECE_CODES.map((code) => {
        const pieceType = `${color}${code}`
        return (
          <div
            key={pieceType}
            className={`palette-piece${selected === pieceType ? ' selected' : ''}`}
            title="Drag onto the board, or click to select and then click squares"
          >
            <SparePiece pieceType={pieceType} />
          </div>
        )
      })}
    </div>
  )
}
