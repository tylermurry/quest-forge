import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "editor",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
