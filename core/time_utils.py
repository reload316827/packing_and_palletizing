from datetime import datetime, timezone


def utc_now_iso():
    # 统一输出 UTC 时间，便于审计与跨时区追踪
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
