import { getSettings } from "@/lib/localDb";
import { buildOutboundProxyOptions } from "@/lib/network/outboundProxy";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getTenantId } = require("../../../tenant-context.cjs");
const stateKey = Symbol.for("xbot.nineRouterOutboundProxyState");
const tenantStates = globalThis[stateKey] || (globalThis[stateKey] = new Map());

function assertTenant(tenantId) {
  const currentTenantId = String(getTenantId());
  if (String(tenantId) !== currentTenantId) {
    throw new Error("Outbound proxy tenant mismatch");
  }
  return currentTenantId;
}

export function setOutboundProxyForTenant(tenantId, settings) {
  const key = assertTenant(tenantId);
  const options = buildOutboundProxyOptions(settings);
  tenantStates.set(key, { options, promise: Promise.resolve(options) });
  return options;
}

export async function initializeOutboundProxyForTenant(tenantId) {
  const key = assertTenant(tenantId);
  const existing = tenantStates.get(key);
  if (existing?.options) return existing.options;
  if (existing?.promise) return existing.promise;

  const promise = getSettings()
    .then((settings) => {
      const options = buildOutboundProxyOptions(settings);
      tenantStates.set(key, { options, promise: Promise.resolve(options) });
      return options;
    })
    .catch(() => {
      tenantStates.delete(key);
      throw new Error("Outbound proxy initialization failed");
    });
  tenantStates.set(key, { options: null, promise });
  return promise;
}

export default initializeOutboundProxyForTenant;
