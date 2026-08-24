import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sidecarRoot = fileURLToPath(new URL("../", import.meta.url));
const vitest = fileURLToPath(new URL("../tests/node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(
  process.execPath,
  [vitest, "run", "--config", "scripts/vitest-offline.config.mjs", ...process.argv.slice(2)],
  {
    cwd: sidecarRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
