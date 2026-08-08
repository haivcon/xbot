"""Optional authenticated pass-through for the xBot Agent Runs API."""

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: str | list[dict[str, Any]]
    conversation_history: list[dict[str, Any]] | None = None
    instructions: str | None = None
    model: str | None = None


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    choice: str


class XBotEngine(Protocol):
    async def create_run(self, context: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]: ...
    async def approval(self, run_id: str, context: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]: ...
    async def events(self, run_id: str, context: dict[str, Any]): ...
    async def stop_run(self, run_id: str, context: dict[str, Any]) -> dict[str, Any]: ...


class UnconfiguredEngine:
    async def _fail(self, *args, **kwargs):
        raise HTTPException(503, "xBot agent engine is not configured")
    create_run = approval = events = stop_run = _fail


def _internal_base_url(value: str) -> str:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    private = (
        host in {"localhost", "::1"}
        or host.startswith("127.")
        or host.startswith("10.")
        or host.startswith("192.168.")
        or any(host.startswith(f"172.{part}.") for part in range(16, 32))
        or "." not in host
        or host.endswith(".internal")
        or host.endswith(".local")
    )
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password or not private:
        raise ValueError("XBOT_UPSTREAM_URL must be a private HTTP(S) service URL")
    return value.rstrip("/")


class HttpXBotEngine:
    """Pass through the xBot Agent Runs API without importing agent core."""

    def __init__(self, base_url: str, token: str, timeout_seconds: float = 60, client: httpx.AsyncClient | None = None):
        self.base_url = _internal_base_url(base_url)
        if not token:
            raise ValueError("XBOT_UPSTREAM_TOKEN is required")
        self.token = token
        self.timeout = timeout_seconds
        self.client = client or httpx.AsyncClient(timeout=timeout_seconds)

    def _headers(self, context: dict[str, Any], *, mutate: bool = False) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if mutate:
            request_id = context.get("requestId")
            if not request_id:
                raise HTTPException(400, "Request context has no idempotency key")
            headers["Idempotency-Key"] = str(request_id)
        return headers

    async def _json(self, method: str, path: str, context: dict[str, Any], payload: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = await self.client.request(
                method, f"{self.base_url}{path}",
                headers=self._headers(context, mutate=method != "GET"),
                json=payload, timeout=self.timeout,
            )
        except httpx.TimeoutException as error:
            raise HTTPException(504, "xBot upstream timed out") from error
        except httpx.HTTPError as error:
            raise HTTPException(502, "xBot upstream request failed") from error
        if response.status_code >= 400:
            status = response.status_code if response.status_code < 500 else 502
            raise HTTPException(status, "xBot upstream rejected the request")
        try:
            return response.json()
        except ValueError as error:
            raise HTTPException(502, "xBot upstream returned invalid JSON") from error

    async def create_run(self, context: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        return await self._json("POST", "/v1/runs", context, payload)

    async def approval(self, run_id: str, context: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        return await self._json("POST", f"/v1/runs/{run_id}/approval", context, payload)

    async def events(self, run_id: str, context: dict[str, Any]):
        async def stream():
            try:
                async with self.client.stream(
                    "GET", f"{self.base_url}/v1/runs/{run_id}/events",
                    headers={**self._headers(context), "Accept": "text/event-stream"}, timeout=self.timeout,
                ) as response:
                    if response.status_code >= 400:
                        status = response.status_code if response.status_code < 500 else 502
                        raise HTTPException(status, "xBot upstream rejected the event stream")
                    if "text/event-stream" not in response.headers.get("content-type", "").lower():
                        raise HTTPException(502, "xBot upstream returned an invalid event stream")
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except httpx.TimeoutException as error:
                raise HTTPException(504, "xBot upstream event stream timed out") from error
            except httpx.HTTPError as error:
                raise HTTPException(502, "xBot upstream event stream failed") from error
        return stream()

    async def stop_run(self, run_id: str, context: dict[str, Any]) -> dict[str, Any]:
        return await self._json("POST", f"/v1/runs/{run_id}/stop", context, {})


@dataclass
class Settings:
    service_token: str
    context_secret: str
    context_max_age_ms: int = 60_000
    upstream_url: str = ""
    upstream_token: str = ""
    upstream_timeout_seconds: float = 60


def _decode_context(encoded: str, signature: str, settings: Settings) -> dict[str, Any]:
    expected = hmac.new(settings.context_secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Invalid context signature")
    try:
        padding = "=" * (-len(encoded) % 4)
        context = json.loads(base64.urlsafe_b64decode(encoded + padding))
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(401, "Invalid context")
    if not context.get("tenantId") or not context.get("userId"):
        raise HTTPException(401, "Incomplete context")
    issued_at = context.get("issuedAt")
    if not isinstance(issued_at, (int, float)) or abs(time.time() * 1000 - issued_at) > settings.context_max_age_ms:
        raise HTTPException(401, "Expired context")
    return context


def create_app(engine: XBotEngine | None = None, settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="xBot Agent Adapter")
    config = settings or Settings(
        os.getenv("XBOT_SERVICE_TOKEN", ""),
        os.getenv("XBOT_CONTEXT_SECRET", ""),
        upstream_url=os.getenv("XBOT_UPSTREAM_URL", ""),
        upstream_token=os.getenv("XBOT_UPSTREAM_TOKEN", ""),
        upstream_timeout_seconds=float(os.getenv("XBOT_UPSTREAM_TIMEOUT_SECONDS", "60")),
    )
    app.state.settings = config
    app.state.engine = engine or (
        HttpXBotEngine(config.upstream_url, config.upstream_token, config.upstream_timeout_seconds)
        if config.upstream_url and config.upstream_token
        else UnconfiguredEngine()
    )

    async def context(
        request: Request,
        authorization: str = Header(default=""),
        x_xbot_context: str = Header(default=""),
        x_xbot_signature: str = Header(default=""),
    ) -> dict[str, Any]:
        config = request.app.state.settings
        if not config.service_token or not hmac.compare_digest(authorization, f"Bearer {config.service_token}"):
            raise HTTPException(401, "Invalid service credential")
        return _decode_context(x_xbot_context, x_xbot_signature, config)

    def assert_run_context(run_id: str, ctx: dict[str, Any]) -> None:
        if ctx.get("runId") != run_id:
            raise HTTPException(403, "Run context mismatch")

    def assert_idempotency(request: Request, ctx: dict[str, Any]) -> None:
        key = request.headers.get("idempotency-key")
        if not key or ctx.get("requestId") != key:
            raise HTTPException(400, "Idempotency context mismatch")

    @app.post("/v1/runs", status_code=202)
    async def create_run(request: Request, body: RunRequest, ctx=Depends(context)):
        assert_idempotency(request, ctx)
        payload = body.model_dump(exclude_none=True)
        result = await request.app.state.engine.create_run(ctx, payload)
        return JSONResponse(result, status_code=202)

    @app.post("/v1/runs/{run_id}/approval")
    async def approval(run_id: str, request: Request, body: ApprovalRequest, ctx=Depends(context)):
        assert_run_context(run_id, ctx)
        assert_idempotency(request, ctx)
        return JSONResponse(await request.app.state.engine.approval(run_id, ctx, body.model_dump()))

    @app.get("/v1/runs/{run_id}/events")
    async def events(run_id: str, request: Request, ctx=Depends(context)):
        assert_run_context(run_id, ctx)
        stream = await request.app.state.engine.events(run_id, ctx)
        return StreamingResponse(stream, media_type="text/event-stream")

    @app.post("/v1/runs/{run_id}/stop")
    async def stop_run(run_id: str, request: Request, ctx=Depends(context)):
        assert_run_context(run_id, ctx)
        assert_idempotency(request, ctx)
        return JSONResponse(await request.app.state.engine.stop_run(run_id, ctx))

    return app


app = create_app()
