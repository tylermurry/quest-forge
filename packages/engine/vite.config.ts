import { defineConfig } from "vite";

// Dev page for the engine. Internal only; the engine itself has no dependencies.
export default defineConfig({
  root: "dev",
  server: { port: 5174, strictPort: true },
});
