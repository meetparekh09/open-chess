import type { Color } from '../api/types'
import { fenToPlacement, glyph } from '../lib/chess'

const FILES = 'abcdefgh'

/** Static, lightweight board for thumbnails. */
export function MiniBoard({ fen, orientation = 'white' }: { fen: string; orientation?: Color }) {
  const placement = fenToPlacement(fen)
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]
  const files = orientation === 'white' ? FILES.split('') : FILES.split('').reverse()

  return (
    <div className="mini-board" aria-label={fen}>
      {ranks.flatMap((rank) =>
        files.map((file) => {
          const square = `${file}${rank}`
          const dark = (FILES.indexOf(file) + rank) % 2 === 1
          const piece = placement[square]
          return (
            <div key={square} className={`mini-square ${dark ? 'dark' : 'light'}`}>
              {piece && <span className={piece[0] === 'w' ? 'white' : 'black'}>{glyph(piece)}</span>}
            </div>
          )
        }),
      )}
    </div>
  )
}
