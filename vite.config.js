import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        studio: resolve(process.cwd(), "studio.html"),
        explore: resolve(process.cwd(), "explore.html")
      }
    }
  }
});
