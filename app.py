"""VaaniAI backend: Flask + SQLAlchemy + JWT.

Run (development):   python app.py
Create an admin:     flask --app app create-admin
"""
import click
from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

from config import Config
from extensions import bcrypt, cors, db, jwt
from models import TokenBlocklist, User


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    from routes import attempts, auth, team
    for module in (auth, attempts, team):
        app.register_blueprint(module.bp)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    # ---- JWT problems are always reported as JSON 401 responses ----
    @jwt.token_in_blocklist_loader
    def is_revoked(_header, payload):
        return db.session.query(TokenBlocklist.id).filter_by(jti=payload["jti"]).first() is not None

    @jwt.unauthorized_loader
    def missing(_reason):
        return jsonify({"error": "Please sign in."}), 401

    @jwt.invalid_token_loader
    def invalid(_reason):
        return jsonify({"error": "Your session is not valid. Please sign in again."}), 401

    @jwt.expired_token_loader
    def expired(_header, _payload):
        return jsonify({"error": "Your session has expired. Please sign in again."}), 401

    @jwt.revoked_token_loader
    def revoked(_header, _payload):
        return jsonify({"error": "You have been logged out. Please sign in again."}), 401

    # ---- Other errors as JSON ----
    @app.errorhandler(HTTPException)
    def http_error(exc):
        messages = {413: f"That file is too large (limit {app.config['MAX_AUDIO_BYTES'] // (1024 * 1024)} MB)."}
        return jsonify({"error": messages.get(exc.code, exc.description)}), exc.code

    @app.errorhandler(Exception)
    def unexpected(exc):
        app.logger.exception("Unhandled error")
        return jsonify({"error": "Something went wrong on the server."}), 500

    @app.after_request
    def headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    with app.app_context():
        db.create_all()   # fine for SQLite / first run; use Flask-Migrate once the schema changes often

    # ---- Command line helpers ----
    @app.cli.command("create-admin")
    @click.option("--email", prompt=True)
    @click.option("--name", prompt=True)
    @click.password_option()
    def create_admin(email, name, password):
        """Create (or promote) an administrator account."""
        email = email.strip().lower()
        if len(password) < 8:
            raise click.ClickException("Use a password of at least 8 characters.")
        user = User.query.filter_by(email=email).first()
        if user:
            user.role = "admin"
            user.clinician_id = None
        else:
            user = User(name=name.strip()[:35], email=email, role="admin",
                        password_hash=bcrypt.generate_password_hash(password).decode())
            db.session.add(user)
        db.session.commit()
        click.echo(f"Administrator ready: {email}")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=app.config["DEBUG"])
