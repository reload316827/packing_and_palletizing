from flask import Flask, jsonify

from api.plans import plans_bp
from api.rules import rules_bp
from core.db import init_db
from core.errors import AppError


def create_app():
    # 初始化 Flask 应用并注册基础组件
    app = Flask(__name__)
    # 启动时确保数据库结构可用
    init_db()
    app.register_blueprint(plans_bp)
    app.register_blueprint(rules_bp)

    @app.route("/healthz", methods=["GET"])
    def healthz():
        # 健康检查接口，供部署探活使用
        return jsonify({"status": "ok"})

    @app.errorhandler(AppError)
    def handle_app_error(err):
        # 统一业务异常返回格式
        return jsonify(err.to_dict()), err.http_status

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8010, debug=False)
