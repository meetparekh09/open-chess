from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session, col, select

from app.db import get_session
from app.models import Attempt, Scenario, utcnow
from app.scenario_service import (
    apply_scenario_input,
    attempts_by_scenario,
    build_solution,
    get_scenario_or_404,
    load_solution,
    normalize_scenario_input,
    replace_solution,
    scenario_detail,
    scenario_goal,
    scenario_out,
)
from app.schemas import (
    ExportBundle,
    GoalType,
    ImportResult,
    ScenarioDetail,
    ScenarioExport,
    ScenarioIn,
    ScenarioOut,
    SolutionStepIn,
    SolutionUpdate,
)

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


def _matches_query(scenario: Scenario, query: str) -> bool:
    haystack = " ".join(
        [scenario.title, scenario.description, scenario.notes, scenario.source, *scenario.tags]
    ).lower()
    return all(word in haystack for word in query.lower().split())


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(
    q: str | None = None,
    tag: str | None = None,
    goal_type: GoalType | None = None,
    difficulty: int | None = Query(default=None, ge=1, le=5),
    session: Session = Depends(get_session),
) -> list[ScenarioOut]:
    statement = select(Scenario).order_by(col(Scenario.updated_at).desc())
    if goal_type:
        statement = statement.where(Scenario.goal_type == goal_type)
    if difficulty:
        statement = statement.where(Scenario.difficulty == difficulty)
    scenarios = list(session.exec(statement))
    if tag:
        scenarios = [s for s in scenarios if tag.strip().lower() in s.tags]
    if q:
        scenarios = [s for s in scenarios if _matches_query(s, q)]
    attempts = attempts_by_scenario(session, [s.id for s in scenarios])
    return [scenario_out(s, attempts[s.id]) for s in scenarios]


@router.get("/tags", response_model=list[str])
def list_tags(session: Session = Depends(get_session)) -> list[str]:
    return sorted({tag for s in session.exec(select(Scenario)) for tag in s.tags})


@router.get("/export", response_model=ExportBundle)
def export_scenarios(
    ids: list[int] | None = Query(default=None), session: Session = Depends(get_session)
) -> ExportBundle:
    statement = select(Scenario).order_by(col(Scenario.id))
    if ids:
        statement = statement.where(col(Scenario.id).in_(ids))
    exported = []
    for scenario in session.exec(statement):
        exported.append(
            ScenarioExport(
                title=scenario.title,
                description=scenario.description,
                notes=scenario.notes,
                start_fen=scenario.start_fen,
                player_side=scenario.player_side,
                goal=scenario_goal(scenario),
                difficulty=scenario.difficulty,
                tags=scenario.tags,
                source=scenario.source,
                opponent_mode=scenario.opponent_mode,
                solution=[
                    SolutionStepIn(move_uci=row.move_uci, comment=row.comment)
                    for row in load_solution(session, scenario.id)
                ],
            )
        )
    return ExportBundle(scenarios=exported)


@router.post("/import", response_model=ImportResult)
def import_scenarios(bundle: ExportBundle, session: Session = Depends(get_session)) -> ImportResult:
    prepared = []
    for index, item in enumerate(bundle.scenarios, start=1):
        try:
            data = normalize_scenario_input(item)
            solution = build_solution(data.start_fen, item.solution)
        except HTTPException as exc:
            raise HTTPException(
                status_code=422, detail=f"Scenario {index} ({item.title}): {exc.detail}"
            ) from exc
        prepared.append((data, solution))

    ids = []
    for data, solution in prepared:
        scenario = Scenario(title=data.title, start_fen=data.start_fen)
        apply_scenario_input(scenario, data)
        session.add(scenario)
        session.flush()
        replace_solution(session, scenario, solution)
        ids.append(scenario.id)
    session.commit()
    return ImportResult(imported=len(ids), ids=ids)


@router.post("", response_model=ScenarioDetail, status_code=201)
def create_scenario(body: ScenarioIn, session: Session = Depends(get_session)) -> ScenarioDetail:
    data = normalize_scenario_input(body)
    scenario = Scenario(title=data.title, start_fen=data.start_fen)
    apply_scenario_input(scenario, data)
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return scenario_detail(session, scenario)


@router.get("/{scenario_id}", response_model=ScenarioDetail)
def get_scenario(scenario_id: int, session: Session = Depends(get_session)) -> ScenarioDetail:
    return scenario_detail(session, get_scenario_or_404(session, scenario_id))


@router.put("/{scenario_id}", response_model=ScenarioDetail)
def update_scenario(
    scenario_id: int,
    body: ScenarioIn,
    clear_solution: bool = False,
    session: Session = Depends(get_session),
) -> ScenarioDetail:
    """Replace a scenario. If the new position breaks the saved solution the request fails
    with 409 unless ``clear_solution`` is set, in which case the solution is dropped."""
    scenario = get_scenario_or_404(session, scenario_id)
    data = normalize_scenario_input(body)
    if data.start_fen != scenario.start_fen:
        steps = [
            SolutionStepIn(move_uci=row.move_uci, comment=row.comment)
            for row in load_solution(session, scenario.id)
        ]
        try:
            solution = build_solution(data.start_fen, steps)
        except HTTPException:
            if not clear_solution:
                raise HTTPException(
                    status_code=409,
                    detail="The saved solution does not fit the new position.",
                ) from None
            solution = []
        replace_solution(session, scenario, solution)
    apply_scenario_input(scenario, data)
    scenario.updated_at = utcnow()
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return scenario_detail(session, scenario)


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: int, session: Session = Depends(get_session)) -> Response:
    scenario = get_scenario_or_404(session, scenario_id)
    for row in load_solution(session, scenario.id):
        session.delete(row)
    for attempt in session.exec(select(Attempt).where(Attempt.scenario_id == scenario.id)):
        session.delete(attempt)
    session.delete(scenario)
    session.commit()
    return Response(status_code=204)


@router.put("/{scenario_id}/solution", response_model=ScenarioDetail)
def update_solution(
    scenario_id: int, body: SolutionUpdate, session: Session = Depends(get_session)
) -> ScenarioDetail:
    scenario = get_scenario_or_404(session, scenario_id)
    replace_solution(session, scenario, build_solution(scenario.start_fen, body.steps))
    scenario.updated_at = utcnow()
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return scenario_detail(session, scenario)
