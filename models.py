import uuid
from datetime import datetime, timezone

from extensions import db

ROLES = ("client", "clinician", "admin")


def utcnow():
    """Naive UTC timestamp (SQLite and MySQL both store it without a timezone)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(35), nullable=False)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="client")
    # For clients: the clinician who may view their attempts.
    clinician_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    attempts = db.relationship("Attempt", backref="user", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email, "role": self.role, "clinician_id": self.clinician_id}


class Attempt(db.Model):
    __tablename__ = "attempts"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    language = db.Column(db.String(20), nullable=False)
    sound = db.Column(db.String(40), nullable=False)
    words = db.Column(db.String(200), nullable=False, default="")
    feeling = db.Column(db.String(40), nullable=False)
    note = db.Column(db.String(1000), nullable=False, default="")
    duration_seconds = db.Column(db.Integer, nullable=False, default=0)
    audio_key = db.Column(db.String(200), nullable=True)
    audio_mime = db.Column(db.String(40), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "language": self.language,
            "sound": self.sound,
            "words": self.words,
            "feeling": self.feeling,
            "note": self.note,
            "duration_seconds": self.duration_seconds,
            "has_audio": bool(self.audio_key),
            "created_at": iso(self.created_at),
        }


class TokenBlocklist(db.Model):
    """Tokens that were logged out before they expired."""
    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(64), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
