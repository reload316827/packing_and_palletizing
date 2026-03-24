class AppError(Exception):
    # 业务异常基类：统一错误码、信息、HTTP状态码
    def __init__(self, code, message, http_status=400, detail=None):
        super(AppError, self).__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.detail = detail

    def to_dict(self):
        # 转为标准 JSON 响应结构
        payload = {"code": self.code, "message": self.message}
        if self.detail is not None:
            payload["detail"] = self.detail
        return payload
