import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session

from app.db import get_session, init_db, make_engine
from app.main import app


@pytest.fixture
def client():
    engine = make_engine("sqlite://", poolclass=StaticPool)
    init_db(engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()
