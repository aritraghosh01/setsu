from app.db import UserRepository
from app.services.auth import AuthService


def test_login_unknown_user_fails():
    service = AuthService(UserRepository())
    assert service.authenticate("missing@example.com", "pw") is None
