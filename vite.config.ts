import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: [".trycloudflare.com", ".lhr.life"],
  },
  preview: {
    allowedHosts: [".trycloudflare.com", ".lhr.life"],
  },
});
