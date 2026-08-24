import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import {
  beginTenantProviderAction,
  pollTenantProviderProxy,
  stopTenantProviderProxy,
} from "@/lib/oauth/tenantProviderActions";

const require = createRequire(import.meta.url);
const { getTenantId } = require("../../../../../../tenant-context.cjs");

function binding() {
  const tenantId = String(getTenantId() || "");
  return { tenantId, userId: tenantId, sessionId: tenantId };
}

function safeFailure(error) {
  const status = Number(error?.statusCode) || 500;
  const code = /^[A-Z][A-Z0-9_]{2,63}$/.test(String(error?.code || ""))
    ? String(error.code)
    : "OAUTH_PROXY_FAILED";
  return NextResponse.json({ error: "Provider authorization did not complete", code }, { status });
}

export async function GET(request, { params }) {
  try {
    const { action } = await params;
    if (action !== "poll-status") return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    const query = new URL(request.url).searchParams;
    return NextResponse.json(pollTenantProviderProxy({
      provider: query.get("provider"), state: query.get("state"), binding: binding(),
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function POST(request, { params }) {
  try {
    const { action } = await params;
    const body = await request.json();
    if (action === "start-proxy") {
      return NextResponse.json(await beginTenantProviderAction({ provider: body.provider, binding: binding() }), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (action === "stop-proxy") {
      return NextResponse.json(await stopTenantProviderProxy({
        provider: body.provider, state: body.state, binding: binding(),
      }), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  } catch (error) {
    return safeFailure(error);
  }
}