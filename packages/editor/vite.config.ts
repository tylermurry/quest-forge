import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { sandboxPlugin } from "./dev/sandbox.ts";

// Editor UI (D51, D90, D92). The same build runs inside Tauri and, for previews, in a
// plain browser against the dev sandbox (D91).
export default defineConfig({
  plugins: [react(), tailwindcss(), sandboxPlugin()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: { port: 5175, strictPort: true },
});
