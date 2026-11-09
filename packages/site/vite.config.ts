import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The public site (D155): the splash page at `/` and the `.quest` player at `/play`.
// Built to `dist/` and served by Cloudflare as static assets (D157).
export default defineConfig({
  plugins: [react()],
  server: { port: 5178, strictPort: true },
});
