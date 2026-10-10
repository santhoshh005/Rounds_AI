"""Supabase client initialization with singleton connection caching.

Key selection (server-side only):
  - If SUPABASE_SERVICE_ROLE_KEY is set, it is used.  The service role key
    bypasses Row Level Security policies and is appropriate for backend use.
    NEVER expose this key to the browser or NEXT_PUBLIC_ environment variables.
  - Otherwise falls back to SUPABASE_ANON_KEY, which is subject to RLS.
    The anon key is acceptable for local / demo use but should be RLS-protected
    in any production deployment.
"""
import logging
import os

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_supabase() -> Client:
    """Return cached Supabase client singleton to prevent socket exhaustion.

    Prefers SUPABASE_SERVICE_ROLE_KEY (server-side, bypasses RLS) over
    SUPABASE_ANON_KEY.  Never uses NEXT_PUBLIC_ variables.
    """
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    anon_key = os.getenv("SUPABASE_ANON_KEY", "")

    key = service_key if service_key else anon_key
    key_type = "service_role" if service_key else "anon"

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and at least one of SUPABASE_SERVICE_ROLE_KEY or "
            "SUPABASE_ANON_KEY must be set in the environment / .env"
        )

    logger.info("Supabase client initialised (key type: %s)", key_type)
    _client = create_client(url, key)
    return _client
