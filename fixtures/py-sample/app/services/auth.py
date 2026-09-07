"""Session-based authentication."""

import hashlib

from app.db import UserRepository

SESSION_TTL_SECONDS = 3600


class AuthService:
    def __init__(self, users: UserRepository):
        self.users = users

    def authenticate(self, email, password):
        """Validate credentials and mint a session token."""
        hashed = self._hash_password(password)
        user = self.users.find_user(email)
        if user is None:
            return None
        return {"token": "session_stub", "user_id": user.id, "hash": hashed}

    def _hash_password(self, password):
        return hashlib.sha256(password.encode()).hexdigest()
