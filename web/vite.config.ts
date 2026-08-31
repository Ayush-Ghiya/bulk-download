import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    // Emit built JS/CSS under /static/ (not the default /assets/) so they
    // don't collide with the /assets/... signed-download route on Vercel.
    assetsDir: "static",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/source": "http://localhost:3001",
      "/assets": "http://localhost:3001",
    },
  },
});
