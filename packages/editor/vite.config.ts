import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Editor UI (D51, D90). The same build runs inside Tauri and, for previews, in a plain browser.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5175, strictPort: true },
});
