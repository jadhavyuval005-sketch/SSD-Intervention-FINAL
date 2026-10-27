"""Clinician and administrator endpoints (role checks happen on the server)."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import ROLES, Attempt, User
from routes.helpers import error, roles_required

bp = Blueprint("team", __name__, url_prefix="/api")


@bp.get("/clients")
@roles_required("clinician", "admin")
def my_clients(user):
    """Clinician: the clients assigned to you. Admin: every client."""
    query = User.query.filter_by(role="client")
    if user.role == "clinician":
        query = query.filter_by(clinician_id=user.id)
    clients = query.order_by(User.name).all()
    counts = dict(
        db.session.query(Attempt.user_id, db.func.count(Attempt.id))
        .filter(Attempt.user_id.in_([c.id for c in clients] or [0]))
        .group_by(Attempt.user_id).all()
    )
    return jsonify([{**c.to_dict(), "attempt_count": counts.get(c.id, 0)} for c in clients])


@bp.get("/clients/<int:client_id>/attempts")
@roles_required("clinician", "admin")
def client_attempts(user, client_id):
    client = db.session.get(User, client_id)
    if not client or client.role != "client":
        return error("Client not found.", 404)
    if user.role == "clinician" and client.clinician_id != user.id:
        return error("This client is not assigned to you.", 403)
    rows = client.attempts.order_by(Attempt.created_at.desc()).limit(500).all()
    return jsonify({"client": client.to_dict(), "attempts": [a.to_dict() for a in rows]})


@bp.get("/admin/users")
@roles_required("admin")
def admin_users(user):
    return jsonify([u.to_dict() for u in User.query.order_by(User.id).all()])


@bp.patch("/admin/users/<int:user_id>")
@roles_required("admin")
def admin_update_user(admin, user_id):
    """Change a user's role and/or assign a client to a clinician."""
    target = db.session.get(User, user_id)
    if not target:
        return error("User not found.", 404)
    data = request.get_json(silent=True) or {}

    if "role" in data:
        role = str(data["role"]).strip().lower()
        if role not in ROLES:
            return error("Role must be client, clinician or admin.")
        if target.id == admin.id and role != "admin":
            return error("You cannot remove your own administrator access.", 400)
        target.role = role

    if "clinician_id" in data:
        cid = data["clinician_id"]
        if cid is None:
            target.clinician_id = None
        else:
            clinician = db.session.get(User, cid) if isinstance(cid, int) else None
            if not clinician or clinician.role != "clinician":
                return error("clinician_id must be the id of a clinician (or null).")
            if target.role != "client":
                return error("Only clients can be assigned to a clinician.")
            target.clinician_id = clinician.id

    if target.role != "client":
        target.clinician_id = None
    db.session.commit()
    return jsonify(target.to_dict())
