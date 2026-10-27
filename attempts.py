import csv
import io

from flask import Blueprint, Response, current_app, jsonify, request

from extensions import db
from models import Attempt, User
from routes.helpers import error, login_required_user
from storage import get_storage, sniff_audio

bp = Blueprint("attempts", __name__, url_prefix="/api")

LANGUAGES = ("Hindi", "English")
FEELINGS = ("Easy", "Okay with practice", "Challenging", "Prefer not to say")


def can_view(user, attempt):
    """Owner, an administrator, or the clinician assigned to the owner."""
    if attempt.user_id == user.id or user.role == "admin":
        return True
    if user.role == "clinician":
        owner = db.session.get(User, attempt.user_id)
        return bool(owner and owner.clinician_id == user.id)
    return False


def _csv_safe(value):
    """Stop spreadsheet apps from running a note like '=HYPERLINK(...)' as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@bp.post("/attempts")
@login_required_user
def create_attempt(user):
    # Accepts multipart/form-data (with an optional "audio" file) or plain JSON.
    data = request.form if request.form else (request.get_json(silent=True) or {})

    language = str(data.get("language", "")).strip()
    sound = str(data.get("sound", "")).strip()
    words = str(data.get("words", "")).strip()
    feeling = str(data.get("feeling", "")).strip()
    note = str(data.get("note", "")).strip()
    try:
        duration = int(float(data.get("duration_seconds", 0) or 0))
    except (TypeError, ValueError):
        return error("duration_seconds must be a number.")

    if language not in LANGUAGES:
        return error("Language must be Hindi or English.")
    if not sound or len(sound) > 40:
        return error("Choose a target sound.")
    if len(words) > 200:
        return error("Practice words are too long.")
    if feeling not in FEELINGS:
        return error("Choose how the attempt felt.")
    if len(note) > 1000:
        return error("Notes can be up to 1000 characters.")
    duration = max(0, min(duration, 3600))

    audio_key = audio_mime = None
    audio = request.files.get("audio")
    if audio and audio.filename is not None:
        head = audio.stream.read(16)
        audio.stream.seek(0)
        kind = sniff_audio(head)
        if not kind:
            return error("Unsupported recording format. Use WebM, Ogg, WAV, MP4/M4A or MP3.", 415)
        audio_mime, ext = kind
        audio_key = get_storage().save(audio, user.id, ext)

    attempt = Attempt(
        user_id=user.id, language=language, sound=sound, words=words, feeling=feeling,
        note=note, duration_seconds=duration, audio_key=audio_key, audio_mime=audio_mime,
    )
    db.session.add(attempt)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        if audio_key:
            get_storage().delete(audio_key)
        raise
    return jsonify(attempt.to_dict()), 201


@bp.get("/attempts")
@login_required_user
def list_attempts(user):
    """Your own saved attempts, newest first."""
    try:
        limit = max(1, min(int(request.args.get("limit", 200)), 500))
    except ValueError:
        limit = 200
    rows = user.attempts.order_by(Attempt.created_at.desc()).limit(limit).all()
    return jsonify([a.to_dict() for a in rows])


@bp.get("/attempts/export.csv")
@login_required_user
def export_csv(user):
    rows = user.attempts.order_by(Attempt.created_at.desc()).all()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Date (UTC)", "Language", "Sound", "Words", "Feeling", "Duration (s)", "Note"])
    for a in rows:
        writer.writerow([_csv_safe(v) for v in (
            a.created_at.strftime("%Y-%m-%d %H:%M"), a.language, a.sound, a.words, a.feeling, a.duration_seconds, a.note)])
    return Response(
        "\ufeff" + out.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": 'attachment; filename="vaaniai-practice-history.csv"'},
    )


@bp.get("/attempts/<attempt_id>")
@login_required_user
def get_attempt(user, attempt_id):
    attempt = db.session.get(Attempt, attempt_id)
    if not attempt or not can_view(user, attempt):
        return error("Attempt not found.", 404)
    return jsonify(attempt.to_dict())


@bp.get("/attempts/<attempt_id>/audio")
@login_required_user
def get_audio(user, attempt_id):
    attempt = db.session.get(Attempt, attempt_id)
    if not attempt or not attempt.audio_key or not can_view(user, attempt):
        return error("Recording not found.", 404)
    return get_storage().response(attempt.audio_key, attempt.audio_mime or "audio/webm")


@bp.delete("/attempts/<attempt_id>")
@login_required_user
def delete_attempt(user, attempt_id):
    """Only the owner can delete an attempt (clinicians and admins get read access only)."""
    attempt = db.session.get(Attempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        return error("Attempt not found.", 404)
    key = attempt.audio_key
    db.session.delete(attempt)
    db.session.commit()
    if key:
        get_storage().delete(key)
    return jsonify({"message": "Attempt deleted."})
