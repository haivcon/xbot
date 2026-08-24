import { resolve } from "node:path";

const sidecarRoot = resolve(import.meta.dirname, "..");
const testsRoot = resolve(sidecarRoot, process.env.NINEROUTER_TEST_ROOT || "tests");

export default {
  test: {
    root: testsRoot,
    environment: "node",
    globals: true,
    include: ["**/*.test.js"],
    exclude: [
      "**/node_modules/**",
      "**/.claude/**",
      "**/dist/**",
      "**/*.real.test.js",
      "**/*.live.test.js",
      "**/embeddings.cloud.test.js",
      "**/xai-oauth-service.test.js",
    ],
    maxConcurrency: 60,
    silent: false,
  },
  resolve: {
    alias: [
      { find: /^open-sse\//, replacement: resolve(sidecarRoot, "open-sse") + "/" },
      { find: "open-sse", replacement: resolve(sidecarRoot, "open-sse") },
      { find: /^@\//, replacement: resolve(sidecarRoot, "src") + "/" },
    ],
  },
};
