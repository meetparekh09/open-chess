import type { AttemptResult, Goal, GoalStatus } from '../api/types'
import { describeGoal, formatDuration } from '../lib/chess'

interface Props {
  goal: Goal
  status: GoalStatus | null
  outcome: { result: AttemptResult; detail: string } | null
  elapsedMs: number
}

const OUTCOME_LABELS: Record<AttemptResult, string> = {
  success: 'Success',
  fail: 'Failed',
  abandoned: 'Gave up',
}

export function GoalPanel({ goal, status, outcome, elapsedMs }: Props) {
  const state = outcome?.result ?? 'in_progress'
  const detail = outcome?.detail ?? status?.detail
  return (
    <div className={`goal-panel ${state}`}>
      <div className="goal-title">{describeGoal(goal)}</div>
      <div className="goal-meta">
        <span className="badge">{outcome ? OUTCOME_LABELS[outcome.result] : 'In progress'}</span>
        {status && goal.type !== 'free' && <span>Moves used: {status.moves_used}</span>}
        <span>{formatDuration(elapsedMs)}</span>
      </div>
      {detail && <div className="goal-detail">{detail}</div>}
    </div>
  )
}
