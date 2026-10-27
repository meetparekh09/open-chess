import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import type { ExportBundle, GoalType, Scenario, ScenarioFilters } from '../api/types'
import { MiniBoard } from '../components/MiniBoard'
import { GOAL_LABELS, describeGoal, formatDuration } from '../lib/chess'

function download(bundle: ExportBundle, name: string) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario'
}

function bestLabel(scenario: Scenario): string | null {
  const best = scenario.stats.best
  if (!best) {
    return null
  }
  const moves = `${best.moves_used} ${best.moves_used === 1 ? 'move' : 'moves'}`
  const verb = scenario.goal.type === 'survive' ? 'survived' : 'solved in'
  return `Best: ${verb} ${moves} (${formatDuration(best.duration_ms)})`
}

export function LibraryPage() {
  const [filters, setFilters] = useState<ScenarioFilters>({})
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const [list, allTags] = await Promise.all([api.listScenarios(filters), api.listTags()])
      setScenarios(list)
      setTags(allTags)
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    }
  }, [filters])

  useEffect(() => {
    const timer = setTimeout(refresh, 150)
    return () => clearTimeout(timer)
  }, [refresh])

  const setFilter = <K extends keyof ScenarioFilters>(key: K, value: ScenarioFilters[K]) =>
    setFilters((previous) => ({ ...previous, [key]: value || undefined }))

  const remove = async (scenario: Scenario) => {
    if (!window.confirm(`Delete "${scenario.title}" with its solution and attempts?`)) {
      return
    }
    try {
      await api.deleteScenario(scenario.id)
      await refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    }
  }

  const exportScenarios = async (only?: Scenario) => {
    try {
      const bundle = await api.exportScenarios(only ? [only.id] : undefined)
      download(bundle, only ? `${slug(only.title)}.json` : 'open-chess-scenarios.json')
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    }
  }

  const importFile = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle
      const result = await api.importScenarios(bundle)
      setMessage({ kind: 'ok', text: `Imported ${result.imported} scenario(s).` })
      await refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: `Import failed: ${errorMessage(error)}` })
    }
  }

  return (
    <div className="page">
      <div className="section-header">
        <h2>Scenarios</h2>
        <div className="toolbar">
          <Link className="button primary" to="/editor">
            New scenario
          </Link>
          <button onClick={() => exportScenarios()}>Export all</button>
          <button onClick={() => fileInput.current?.click()}>Import</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                importFile(file)
              }
              event.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Search title, description, notes, tags"
          value={filters.q ?? ''}
          onChange={(event) => setFilter('q', event.target.value)}
        />
        <select value={filters.tag ?? ''} onChange={(event) => setFilter('tag', event.target.value)}>
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select
          value={filters.goal_type ?? ''}
          onChange={(event) => setFilter('goal_type', event.target.value as GoalType)}
        >
          <option value="">All goals</option>
          {Object.entries(GOAL_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={filters.difficulty ?? ''}
          onChange={(event) => setFilter('difficulty', Number(event.target.value))}
        >
          <option value="">Any difficulty</option>
          {[1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={level}>
              {'★'.repeat(level)}
            </option>
          ))}
        </select>
      </div>

      {message && <p className={`message ${message.kind}`}>{message.text}</p>}

      {scenarios === null ? (
        <p className="muted">Loading...</p>
      ) : scenarios.length === 0 ? (
        <p className="muted">
          No scenarios found. <Link to="/editor">Set up a position</Link> to create one.
        </p>
      ) : (
        <div className="cards">
          {scenarios.map((scenario) => (
            <article key={scenario.id} className="card">
              <Link to={`/practice/${scenario.id}`}>
                <MiniBoard fen={scenario.start_fen} orientation={scenario.player_side} />
              </Link>
              <div className="card-body">
                <h3>
                  <Link to={`/practice/${scenario.id}`}>{scenario.title}</Link>
                </h3>
                <div className="muted">
                  <span className="stars">{'★'.repeat(scenario.difficulty)}</span> ·{' '}
                  {describeGoal(scenario.goal)}
                </div>
                {scenario.description && <p className="card-description">{scenario.description}</p>}
                {scenario.tags.length > 0 && (
                  <div className="tags">
                    {scenario.tags.map((tag) => (
                      <button key={tag} className="tag" onClick={() => setFilter('tag', tag)}>
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="muted small">
                  {scenario.stats.count} {scenario.stats.count === 1 ? 'attempt' : 'attempts'},{' '}
                  {scenario.stats.success_count} successful
                  {bestLabel(scenario) ? ` · ${bestLabel(scenario)}` : ''}
                </div>
                <div className="card-actions">
                  <Link to={`/practice/${scenario.id}`}>Practice</Link>
                  <Link to={`/scenarios/${scenario.id}/solution`}>Solution</Link>
                  <Link to={`/editor/${scenario.id}`}>Edit</Link>
                  <button className="link" onClick={() => exportScenarios(scenario)}>
                    Export
                  </button>
                  <button className="link danger" onClick={() => remove(scenario)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
