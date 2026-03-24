import sqlite3
from contextlib import contextmanager
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "output" / "packing.db"
MIGRATION_PATH = PROJECT_ROOT / "migrations" / "001_init.sql"


def _ensure_parent_dir():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_conn():
    _ensure_parent_dir()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    if not MIGRATION_PATH.exists():
        raise FileNotFoundError("missing migration file: {0}".format(MIGRATION_PATH))
    sql = MIGRATION_PATH.read_text(encoding="utf-8")
    with get_conn() as conn:
        conn.executescript(sql)
