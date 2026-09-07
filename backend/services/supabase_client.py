"""Supabase client initialization with singleton connection caching."""
import os
from supabase import create_client, Client

_client: Client | None = None

def get_supabase() -> Client:
    """Return cached Supabase client singleton to prevent socket exhaustion."""
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment / .env"
        )
    _client = create_client(url, key)
    return _client
