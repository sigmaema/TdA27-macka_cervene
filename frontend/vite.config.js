import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT) || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port,
    proxy: {
      "/api": "http://localhost:8081",
    },
  },
});
