import os
from contextlib import contextmanager

try:
    import psycopg2
except ModuleNotFoundError:  # pragma: no cover - fallback for test envs without DB deps
    psycopg2 = None

DATABASE_URL = os.getenv("DATABASE_URL", "")


@contextmanager
def get_connection():
    """Context manager that yields a psycopg2 connection and closes it on exit."""
    if psycopg2 is None:
        raise RuntimeError("psycopg2 is not installed; database access is unavailable")
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# Alias for backward compatibility
get_db = get_connection
