import type { Color } from '../api/types'

interface Props {
  sans: string[]
  cursor: number
  startTurn: Color
  startMoveNumber?: number
  onSelect: (index: number) => void
}

/** Moves grouped by move number; clicking a move jumps to the position after it. */
export function MoveList({ sans, cursor, startTurn, startMoveNumber = 1, onSelect }: Props) {
  const offset = startTurn === 'black' ? 1 : 0
  const rows: { number: number; cells: (number | null)[] }[] = []
  for (let slot = 0; slot < sans.length + offset; slot += 2) {
    const cells = [slot, slot + 1].map((s) => {
      const index = s - offset
      return index >= 0 && index < sans.length ? index : null
    })
    rows.push({ number: startMoveNumber + slot / 2, cells })
  }

  if (sans.length === 0) {
    return <p className="muted">No moves yet.</p>
  }

  return (
    <ol className="move-list">
      {rows.map((row) => (
        <li key={row.number}>
          <span className="move-number">{row.number}.</span>
          {row.cells.map((index, column) =>
            index === null ? (
              <span key={column} className="move">
                {column === 0 ? '...' : ''}
              </span>
            ) : (
              <button
                key={column}
                className={`move${index + 1 === cursor ? ' current' : ''}${index >= cursor ? ' future' : ''}`}
                onClick={() => onSelect(index + 1)}
              >
                {sans[index]}
              </button>
            ),
          )}
        </li>
      ))}
    </ol>
  )
}
