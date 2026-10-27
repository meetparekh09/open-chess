export type Color = 'white' | 'black'
export type GoalType = 'free' | 'capture' | 'survive' | 'checkmate' | 'promote'
export type PieceLetter = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type GoalStatusValue = 'in_progress' | 'success' | 'fail'
export type AttemptResult = 'success' | 'fail' | 'abandoned'
export type OpponentMode = 'manual' | 'auto' | 'goal_search' | 'stockfish'
export type EngineName = 'goal_search' | 'stockfish'

export interface GoalParams {
  color?: Color | null
  piece?: PieceLetter | null
  square?: string | null
  max_moves?: number | null
}

export interface Goal {
  type: GoalType
  params: GoalParams
}

export interface MoveInfo {
  uci: string
  san: string
  from_square: string
  to_square: string
  promotion: string | null
}

export interface PositionInfo {
  fen: string
  turn: Color
  legal_moves: MoveInfo[]
  warnings: string[]
  is_check: boolean
  is_checkmate: boolean
  has_legal_moves: boolean
}

export interface MoveResult {
  uci: string
  san: string
  captured: string | null
  position: PositionInfo
}

export interface EngineMoveResult extends MoveResult {
  engine: EngineName
  depth: number | null
  /** From the engine's point of view; positive is good for the engine. */
  score: number | null
  note: string
}

export interface EngineStatus {
  stockfish_available: boolean
  stockfish_name: string | null
  stockfish_path: string | null
}

export interface GoalStatus {
  status: GoalStatusValue
  detail: string
  moves_used: number
  ply_count: number
}

export interface SolutionStepIn {
  move_uci: string
  comment: string
}

export interface SolutionStep extends SolutionStepIn {
  ply: number
  san: string
  fen_after: string
}

export interface ScenarioInput {
  title: string
  description: string
  notes: string
  start_fen: string
  player_side: Color
  goal: Goal
  difficulty: number
  tags: string[]
  source: string
  opponent_mode: OpponentMode
}

export interface Attempt {
  id: number
  scenario_id: number
  started_at: string
  ended_at: string
  moves: string[]
  result: AttemptResult
  ply_count: number
  moves_used: number
  duration_ms: number
}

export interface AttemptStats {
  count: number
  success_count: number
  best: Attempt | null
}

export interface Scenario extends ScenarioInput {
  id: number
  created_at: string
  updated_at: string
  stats: AttemptStats
}

export interface ScenarioDetail extends Scenario {
  solution: SolutionStep[]
}

export interface ExportBundle {
  version: number
  scenarios: (ScenarioInput & { solution: SolutionStepIn[] })[]
}

export interface ScenarioFilters {
  q?: string
  tag?: string
  goal_type?: GoalType
  difficulty?: number
}
