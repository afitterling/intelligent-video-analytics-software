import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const silenceWellKnownProbes = {
  name: "iva-silence-well-known-probes",
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { statusCode: number; end: () => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith("/.well-known/")) {
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [silenceWellKnownProbes, remix(), tsconfigPaths()],
});
