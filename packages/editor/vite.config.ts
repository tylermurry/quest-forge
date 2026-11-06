import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { sandboxPlugin } from "./dev/sandbox.ts";

// Editor UI (D51, D90). The same build runs inside Tauri and, for previews, in a
// plain browser against the dev sandbox (D91).
export default defineConfig({
  plugins: [react(), sandboxPlugin()],
  clearScreen: false,
  server: { port: 5175, strictPort: true },
});
