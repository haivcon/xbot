import base64
import hashlib
import hmac
import json
import time

import httpx
from fastapi.testclient import TestClient

from app.main import HttpXBotEngine, Settings, create_app


class Engine:
    def __init__(self):
        self.calls = []

    async def create_run(self, context, payload):
        self.calls.append(("create", context, payload))
        return {"run_id": "run-1", "status": "started"}

    async def approval(self, run_id, context, payload):
        self.calls.append(("approval", run_id, context, payload))
        return {"run_id": run_id, "choice": payload["choice"], "resolved": 1}

    async def events(self, run_id, context):
        async def stream():
            yield 'data: {"event":"message.delta","run_id":"run-1","delta":"ok"}\n\n'
            yield 'data: {"event":"run.completed","run_id":"run-1","output":"ok"}\n\n'
            yield ": stream closed\n\n"
        return stream()

    async def stop_run(self, run_id, context):
        self.calls.append(("stop", run_id, context))
        return {"run_id": run_id, "status": "stopping"}


SETTINGS = Settings("service", "context-secret")
ENGINE = Engine()
CLIENT = TestClient(create_app(ENGINE, SETTINGS))


def headers(context):
    encoded = base64.urlsafe_b64encode(json.dumps(context, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(SETTINGS.context_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return {"Authorization": "Bearer service", "X-XBot-Context": encoded, "X-XBot-Signature": signature}


def test_create_is_an_optional_passthrough_for_official_runs_payload():
    context = {"tenantId": "tenant-a", "userId": "user-a", "requestId": "request-1", "issuedAt": time.time() * 1000}
    payload = {
        "input": "hello",
        "conversation_history": [{"role": "user", "content": "before"}],
        "instructions": "Be concise",
        "model": "model-a",
    }
    response = CLIENT.post("/v1/runs", headers={**headers(context), "Idempotency-Key": "request-1"}, json=payload)
    assert response.status_code == 202
    assert response.json() == {"run_id": "run-1", "status": "started"}
    assert ENGINE.calls[-1][2] == payload


def test_create_rejects_non_official_messages_payload():
    context = {"tenantId": "tenant-a", "userId": "user-a", "requestId": "request-bad", "issuedAt": time.time() * 1000}
    response = CLIENT.post("/v1/runs", headers={**headers(context), "Idempotency-Key": "request-bad"}, json={"messages": []})
    assert response.status_code == 422


def test_run_routes_reject_cross_run_context_before_engine():
    context = {"tenantId": "tenant-a", "userId": "user-a", "runId": "run-other", "requestId": "request-2", "issuedAt": time.time() * 1000}
    response = CLIENT.post("/v1/runs/run-1/stop", headers={**headers(context), "Idempotency-Key": "request-2"}, json={})
    assert response.status_code == 403


def test_approval_and_stop_match_official_routes_and_require_idempotency():
    approval_context = {"tenantId": "tenant-a", "userId": "user-a", "runId": "run-1", "requestId": "request-2", "issuedAt": time.time() * 1000}
    approval = CLIENT.post(
        "/v1/runs/run-1/approval",
        headers={**headers(approval_context), "Idempotency-Key": "request-2"},
        json={"choice": "once"},
    )
    assert approval.status_code == 200
    assert approval.json() == {"run_id": "run-1", "choice": "once", "resolved": 1}

    stop_context = {**approval_context, "requestId": "request-3", "issuedAt": time.time() * 1000}
    stop = CLIENT.post(
        "/v1/runs/run-1/stop",
        headers={**headers(stop_context), "Idempotency-Key": "request-3"},
        json={},
    )
    assert stop.status_code == 200
    assert stop.json() == {"run_id": "run-1", "status": "stopping"}


def test_mutating_run_routes_require_context_bound_idempotency_key():
    context = {"tenantId": "tenant-a", "userId": "user-a", "runId": "run-1", "requestId": "request-2", "issuedAt": time.time() * 1000}
    response = CLIENT.post("/v1/runs/run-1/stop", headers={**headers(context), "Idempotency-Key": "wrong"}, json={})
    assert response.status_code == 400


def test_events_pass_through_official_sse_which_closes_without_done_sentinel():
    context = {"tenantId": "tenant-a", "userId": "user-a", "runId": "run-1", "issuedAt": time.time() * 1000}
    response = CLIENT.get("/v1/runs/run-1/events", headers=headers(context))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"event":"message.delta"' in response.text
    assert '"event":"run.completed"' in response.text
    assert "[DONE]" not in response.text


def test_http_engine_passes_routes_and_internal_auth_to_official_runs_api():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["authorization"] == "Bearer upstream-token"
        if request.url.path.endswith("/events"):
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b'data: {"event":"run.completed"}\n\n')
        if request.url.path == "/v1/runs":
            return httpx.Response(202, json={"run_id": "run-1", "status": "started"})
        return httpx.Response(200, json={"run_id": "run-1", "status": "ok"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    engine = HttpXBotEngine("http://xbot.internal", "upstream-token", client=client)
    context = {"tenantId": "tenant-a", "userId": "user-a", "requestId": "request-1"}

    import asyncio
    assert asyncio.run(engine.create_run(context, {"input": "hello"}))["run_id"] == "run-1"
    context["requestId"] = "request-2"
    assert asyncio.run(engine.approval("run-1", context, {"choice": "once"}))["status"] == "ok"
    stream = asyncio.run(engine.events("run-1", context))

    async def collect():
        return b"".join([chunk async for chunk in stream])

    assert b"run.completed" in asyncio.run(collect())
    context["requestId"] = "request-3"
    assert asyncio.run(engine.stop_run("run-1", context))["status"] == "ok"
    assert [request.url.path for request in requests] == [
        "/v1/runs", "/v1/runs/run-1/approval", "/v1/runs/run-1/events", "/v1/runs/run-1/stop"
    ]
    assert requests[0].headers["idempotency-key"] == "request-1"