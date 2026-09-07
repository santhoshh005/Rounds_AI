"""Supabase client initialisation.  Reads credentials from environment."""
import os
from supabase import create_client, Client

_url: str = os.getenv("SUPABASE_URL", "")
_key: str = os.getenv("SUPABASE_ANON_KEY", "")

def get_supabase() -> Client:
    """Return a Supabase client.  Raises if credentials are missing."""
    if not _url or not _key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment / .env"
        )
    return create_client(_url, _key)
