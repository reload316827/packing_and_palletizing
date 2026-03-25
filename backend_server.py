from flask import Flask, jsonify

from api.layout import layout_bp
from api.plans import plans_bp
from api.rules import rules_bp
from core.db import init_db
from core.errors import AppError


def create_app():
    # 初始化 Flask 应用并注册路由
    app = Flask(__name__, static_folder="demo", static_url_path="/demo")
    init_db()
    app.register_blueprint(plans_bp)
    app.register_blueprint(rules_bp)
    app.register_blueprint(layout_bp)

    @app.route("/", methods=["GET"])
    def index():
        # 首页导航，便于手动验证服务是否启动
        return jsonify(
            {
                "service": "packing_and_palletizing_api",
                "status": "running",
                "endpoints": {
                    "health": "/healthz",
                    "plans": "/api/plans",
                    "rules": "/api/rules",
                    "layout": "/api/layout/{plan_id}",
                    "demo_rules_page": "/demo/rules.html",
                },
            }
        )

    @app.route("/healthz", methods=["GET"])
    def healthz():
        # 健康检查接口
        return jsonify({"status": "ok"})

    @app.errorhandler(AppError)
    def handle_app_error(err):
        # 统一业务异常返回格式
        return jsonify(err.to_dict()), err.http_status

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8010, debug=False)
