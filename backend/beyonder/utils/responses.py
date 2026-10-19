from flask import jsonify

def ok(message=None, **data):
    body = {"success": True}
    if message:
        body["message"] = message
    body.update(data)
    return jsonify(body)

def fail(message, status=400, **extra):
    body = {"success": False, "message": message}
    body.update(extra)
    return jsonify(body), status
