"""Pytest configuration enforcing strict database isolation during test execution."""
import os
import pytest

# Always run tests in TEST_MODE so real Supabase tables are never written to or mutated
os.environ["TEST_MODE"] = "true"


@pytest.fixture(autouse=True)
def enforce_test_mode_isolation(monkeypatch):
    """Ensure TEST_MODE=true for every test and guard against real Supabase client creation."""
    monkeypatch.setenv("TEST_MODE", "true")

    def _forbidden_supabase_client(*args, **kwargs):
        raise RuntimeError("Direct Supabase client access is blocked during pytest runs (TEST_MODE=true).")

    monkeypatch.setattr("backend.services.supabase_client.get_supabase", _forbidden_supabase_client)
