import pytest

from app.engine import get_engine


def test_manual_mode_has_no_engine():
    assert get_engine("manual") is None


def test_other_modes_are_not_implemented_yet():
    with pytest.raises(NotImplementedError):
        get_engine("stockfish")
