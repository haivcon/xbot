import { readFileSync } from "node:fs";

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error("Usage: node scripts/verify-offline-differential.mjs <baseline.json> <candidate.json>");
  process.exit(2);
}

function testStatuses(path) {
  const result = JSON.parse(readFileSync(path, "utf8"));
  const statuses = new Map();
  for (const file of result.testResults || []) {
    const normalizedFile = file.name
      .replaceAll("\\", "/")
      .replace(/^.*\/tests-current\//, "")
      .replace(/^.*\/tests\//, "");
    for (const assertion of file.assertionResults || []) {
      const name = assertion.fullName || assertion.title;
      statuses.set(`${normalizedFile} :: ${name}`, assertion.status);
    }
  }
  return { result, statuses };
}

const baseline = testStatuses(baselinePath);
const candidate = testStatuses(candidatePath);
const missing = [...baseline.statuses.keys()].filter((name) => !candidate.statuses.has(name));
const regressions = [...baseline.statuses.entries()]
  .filter(([name, status]) => status === "passed" && candidate.statuses.get(name) === "failed")
  .map(([name]) => name);
const newFailures = [...candidate.statuses.entries()]
  .filter(([name, status]) => status === "failed" && !baseline.statuses.has(name))
  .map(([name]) => name);

if (missing.length || regressions.length || newFailures.length) {
  if (missing.length) {
    console.error(`OFFLINE GATE FAILED: ${missing.length} baseline tests missing from candidate`);
    missing.forEach((name) => console.error(`  missing: ${name}`));
  }
  if (regressions.length) {
    console.error(`OFFLINE GATE FAILED: ${regressions.length} baseline pass-to-fail regressions`);
    regressions.forEach((name) => console.error(`  regression: ${name}`));
  }
  if (newFailures.length) {
    console.error(`OFFLINE GATE FAILED: ${newFailures.length} new tests fail in candidate`);
    newFailures.forEach((name) => console.error(`  new failure: ${name}`));
  }
  process.exit(1);
}

const baselineFailures = [...baseline.statuses.values()].filter((status) => status === "failed").length;
const candidateFailures = [...candidate.statuses.values()].filter((status) => status === "failed").length;
console.log(
  `OFFLINE GATE PASS: 0 pass-to-fail regressions; baseline failures=${baselineFailures}; candidate failures=${candidateFailures}; tests=${candidate.statuses.size}`,
);
