import os
from contextlib import contextmanager

import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "")


@contextmanager
def get_connection():
    """Context manager that yields a psycopg2 connection and closes it on exit."""
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
