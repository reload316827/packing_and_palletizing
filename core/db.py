import sqlite3
from contextlib import contextmanager
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "output" / "packing.db"
MIGRATION_DIR = PROJECT_ROOT / "migrations"


def _ensure_parent_dir():
    # 确保数据库目录存在
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_conn():
    # 统一数据库连接上下文，自动提交与关闭
    _ensure_parent_dir()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    # 启动时按序执行全部迁移脚本（001, 002, ...）
    if not MIGRATION_DIR.exists():
        raise FileNotFoundError("missing migration directory: {0}".format(MIGRATION_DIR))

    migration_files = sorted(MIGRATION_DIR.glob("*.sql"))
    if not migration_files:
        raise FileNotFoundError("no migration file found in: {0}".format(MIGRATION_DIR))

    with get_conn() as conn:
        for migration_file in migration_files:
            sql = migration_file.read_text(encoding="utf-8")
            conn.executescript(sql)
