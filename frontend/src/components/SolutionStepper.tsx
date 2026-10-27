import type { Color } from '../api/types'

interface Step {
  san: string
  comment: string
}

interface Props {
  steps: Step[]
  cursor: number
  startTurn: Color
  startMoveNumber: number
  onGoTo: (index: number) => void
  onCommentChange?: (index: number, comment: string) => void
}

function moveLabel(index: number, startTurn: Color, startMoveNumber: number): string {
  const slot = index + (startTurn === 'black' ? 1 : 0)
  const number = startMoveNumber + Math.floor(slot / 2)
  return slot % 2 === 0 ? `${number}.` : `${number}...`
}

/** Step-by-step walkthrough of a solution line; editable when `onCommentChange` is given. */
export function SolutionStepper({
  steps,
  cursor,
  startTurn,
  startMoveNumber,
  onGoTo,
  onCommentChange,
}: Props) {
  const current = cursor > 0 ? steps[cursor - 1] : null

  return (
    <div className="stepper">
      <div className="toolbar">
        <button onClick={() => onGoTo(0)} disabled={cursor === 0}>
          Start
        </button>
        <button onClick={() => onGoTo(cursor - 1)} disabled={cursor === 0}>
          Previous
        </button>
        <button onClick={() => onGoTo(cursor + 1)} disabled={cursor >= steps.length}>
          Next
        </button>
        <button onClick={() => onGoTo(steps.length)} disabled={cursor >= steps.length}>
          End
        </button>
        <span className="muted">
          Step {cursor} of {steps.length}
        </span>
      </div>

      {!onCommentChange && (
        <div className="step-comment">
          {current ? (
            <>
              <strong>
                {moveLabel(cursor - 1, startTurn, startMoveNumber)} {current.san}
              </strong>
              {current.comment ? ` ${current.comment}` : ''}
            </>
          ) : (
            <span className="muted">Starting position. Press Next to walk through the solution.</span>
          )}
        </div>
      )}

      <ol className="steps">
        {steps.map((step, index) => (
          <li key={index} className={index + 1 === cursor ? 'current' : ''}>
            <button className="move" onClick={() => onGoTo(index + 1)}>
              {moveLabel(index, startTurn, startMoveNumber)} {step.san}
            </button>
            {onCommentChange ? (
              <textarea
                rows={1}
                placeholder="Why this move?"
                value={step.comment}
                onChange={(event) => onCommentChange(index, event.target.value)}
              />
            ) : (
              step.comment && <span className="muted">{step.comment}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
