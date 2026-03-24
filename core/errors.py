from typing import Any, Dict


class AppError(Exception):
    def __init__(self, code, message, http_status=400, detail=None):
        super(AppError, self).__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.detail = detail

    def to_dict(self):
        payload = {"code": self.code, "message": self.message}
        if self.detail is not None:
            payload["detail"] = self.detail
        return payload
