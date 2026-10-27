import re
import threading
import time
from datetime import timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, jwt_required

from extensions import bcrypt, db
from models import TokenBlocklist, User, utcnow
from routes.helpers import error, login_required_user

bp = Blueprint("auth", __name__, url_prefix="/api")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
SELF_SERVICE_ROLES = ("client", "clinician")   # administrators are created with: flask create-admin
MIN_PASSWORD = 8

# --- Simple login throttle (per server process): 5 wrong passwords per 15 minutes ---
_WINDOW, _MAX_FAILS = 15 * 60, 5
_fails, _lock = {}, threading.Lock()


def _throttle_key(email):
    return (request.remote_addr or "?", email)


def _is_blocked(key):
    now = time.time()
    with _lock:
        recent = [t for t in _fails.get(key, []) if now - t < _WINDOW]
        _fails[key] = recent
        if len(_fails) > 5000:
            for k in [k for k, v in _fails.items() if not v or now - v[-1] >= _WINDOW]:
                _fails.pop(k, None)
        return len(recent) >= _MAX_FAILS


def _record_fail(key):
    with _lock:
        _fails.setdefault(key, []).append(time.time())


def _clear_fails(key):
    with _lock:
        _fails.pop(key, None)


# A real hash to compare against when the email is unknown, so timing does not reveal which emails exist.
_DUMMY_HASH = None


def _dummy_hash():
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = bcrypt.generate_password_hash("not-a-real-password").decode()
    return _DUMMY_HASH


def _token_response(user, status=200):
    token = create_access_token(identity=str(user.id))   # JWT subject must be a string
    return jsonify({"access_token": token, "user": user.to_dict()}), status


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    role = str(data.get("role", "client")).strip().lower()

    if not name or len(name) > 35:
        return error("Enter your name (up to 35 characters).")
    if not EMAIL_RE.match(email) or len(email) > 254:
        return error("Enter a valid email address.")
    if len(password) < MIN_PASSWORD or len(password) > 128:
        return error(f"Use a password of {MIN_PASSWORD} to 128 characters.")
    if role not in SELF_SERVICE_ROLES:
        return error("Choose Client or Clinician. Administrator accounts are created by the site owner.")
    if User.query.filter_by(email=email).first():
        return error("An account with this email already exists. Try signing in.", 409)

    user = User(
        name=name,
        email=email,
        role=role,
        password_hash=bcrypt.generate_password_hash(password).decode(),
    )
    db.session.add(user)
    db.session.commit()
    return _token_response(user, 201)


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    key = _throttle_key(email)

    if _is_blocked(key):
        return error("Too many failed attempts. Wait 15 minutes and try again.", 429)

    user = User.query.filter_by(email=email).first()
    ok = bcrypt.check_password_hash(user.password_hash if user else _dummy_hash(), password)
    if not user or not ok:
        _record_fail(key)
        return error("Incorrect email or password.", 401)

    _clear_fails(key)
    return _token_response(user)


@bp.get("/me")
@login_required_user
def me(user):
    return jsonify(user.to_dict())


@bp.post("/logout")
@jwt_required()
def logout():
    """Revoke this token so it cannot be used again."""
    db.session.add(TokenBlocklist(jti=get_jwt()["jti"]))
    # Tidy up: entries older than the token lifetime can no longer matter.
    cutoff = utcnow() - current_app.config["JWT_ACCESS_TOKEN_EXPIRES"] - timedelta(minutes=5)
    TokenBlocklist.query.filter(TokenBlocklist.created_at < cutoff).delete()
    db.session.commit()
    return jsonify({"message": "Logged out."})
