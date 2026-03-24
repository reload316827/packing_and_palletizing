from __future__ import annotations

from flask import Flask, jsonify

from api.plans import plans_bp
from core.db import init_db
from core.errors import AppError


def create_app() -> Flask:
    app = Flask(__name__)
    init_db()
    app.register_blueprint(plans_bp)

    @app.route("/healthz", methods=["GET"])
    def healthz():
        return jsonify({"status": "ok"})

    @app.errorhandler(AppError)
    def handle_app_error(err: AppError):
        return jsonify(err.to_dict()), err.http_status

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8010, debug=False)
