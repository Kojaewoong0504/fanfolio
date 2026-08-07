from app.auth_tokens import AuthTokenError, decode_access_token, issue_access_token
from app.models import Role, User


def test_access_token_contains_scoped_identity_claims() -> None:
    user = User(id="fan", email="fan@example.com", role=Role.FAN)

    token = issue_access_token(user, client="fan")
    claims = decode_access_token(token, expected_client="fan")

    assert claims["sub"] == "fan"
    assert claims["role"] == "fan"
    assert claims["client"] == "fan"
    assert claims["typ"] == "access"
    assert claims["iss"] == "fanfolio"
    assert claims["aud"] == "fanfolio-api"
    assert claims["exp"] > claims["iat"]


def test_access_token_from_another_client_is_rejected() -> None:
    user = User(id="fan", email="fan@example.com", role=Role.FAN)
    token = issue_access_token(user, client="fan")

    try:
        decode_access_token(token, expected_client="admin")
    except AuthTokenError as error:
        assert error.code == "AUTH_TOKEN_INVALID"
    else:
        raise AssertionError("a fan access token must not be accepted by the admin client")
