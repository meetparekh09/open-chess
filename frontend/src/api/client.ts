import type {
  Attempt,
  EngineMoveResult,
  EngineStatus,
  ExportBundle,
  Goal,
  GoalStatus,
  MoveResult,
  OpponentMode,
  PositionInfo,
  ScenarioDetail,
  Scenario,
  ScenarioFilters,
  ScenarioInput,
  SolutionStepIn,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // Non-JSON error bodies keep the status text.
    }
    throw new ApiError(response.status, detail)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) })

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  validate: (fen: string) => post<PositionInfo>('/positions/validate', { fen }),
  move: (fen: string, moveUci: string) =>
    post<MoveResult>('/positions/move', { fen, move_uci: moveUci }),
  evaluateGoal: (startFen: string, goal: Goal, moves: string[]) =>
    post<GoalStatus>('/goals/evaluate', { start_fen: startFen, goal, moves }),
  engineMove: (startFen: string, moves: string[], goal: Goal, mode: OpponentMode, thinkMs: number) =>
    post<EngineMoveResult>('/engine/move', {
      start_fen: startFen,
      moves,
      goal,
      mode,
      think_ms: thinkMs,
    }),
  engineStatus: () => request<EngineStatus>('/engine/status'),

  listScenarios: (filters: ScenarioFilters = {}) =>
    request<Scenario[]>(`/scenarios${query({ ...filters })}`),
  listTags: () => request<string[]>('/scenarios/tags'),
  getScenario: (id: number) => request<ScenarioDetail>(`/scenarios/${id}`),
  createScenario: (input: ScenarioInput) => post<ScenarioDetail>('/scenarios', input),
  updateScenario: (id: number, input: ScenarioInput, clearSolution = false) =>
    put<ScenarioDetail>(`/scenarios/${id}${clearSolution ? '?clear_solution=true' : ''}`, input),
  deleteScenario: (id: number) => request<void>(`/scenarios/${id}`, { method: 'DELETE' }),
  saveSolution: (id: number, steps: SolutionStepIn[]) =>
    put<ScenarioDetail>(`/scenarios/${id}/solution`, { steps }),

  listAttempts: (id: number) => request<Attempt[]>(`/scenarios/${id}/attempts`),
  recordAttempt: (
    id: number,
    attempt: { started_at: string; ended_at: string; moves: string[]; abandoned: boolean },
  ) => post<Attempt>(`/scenarios/${id}/attempts`, attempt),

  exportScenarios: (ids?: number[]) =>
    request<ExportBundle>(`/scenarios/export${ids?.length ? `?${ids.map((id) => `ids=${id}`).join('&')}` : ''}`),
  importScenarios: (bundle: ExportBundle) =>
    post<{ imported: number; ids: number[] }>('/scenarios/import', bundle),
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
