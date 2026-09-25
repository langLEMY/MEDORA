/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// base "./": el launcher sirve dist/ desde una carpeta local mapeada a
// https://app.medora.local (WebView2 SetVirtualHostNameToFolderMapping).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("recharts") || id.includes("d3-")) return "graficos";
          if (id.includes("@supabase") || id.includes("@tanstack")) return "datos";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] },
});
