from flask import request

def client_ip():
    real = request.headers.get("X-Real-IP", "").strip()
    if real:
        return real
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.remote_addr or "unknown"

def user_agent():
    return (request.headers.get("User-Agent") or "")[:300]
