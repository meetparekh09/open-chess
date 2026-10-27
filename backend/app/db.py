import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "open_chess.db"
DATABASE_URL = os.environ.get("OPEN_CHESS_DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")


def make_engine(url: str = DATABASE_URL, **kwargs) -> Engine:
    return create_engine(url, connect_args={"check_same_thread": False}, **kwargs)


db_engine = make_engine()


def init_db(engine: Engine = db_engine) -> None:
    if engine.url.drivername == "sqlite" and engine.url.database not in (None, "", ":memory:"):
        Path(engine.url.database).parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(db_engine) as session:
        yield session
