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
  plugins: [
    silenceWellKnownProbes,
    remix({
      ignoredRouteFiles: ["**/*"],
      routes(defineRoutes) {
        return defineRoutes((route) => {
          route("/", "routes/_index.tsx", { index: true });
          route("devices", "routes/devices._index.tsx");
          route("devices/new", "routes/devices.new.tsx");
          route("devices/:id", "routes/devices.$id.tsx");
          route("devices/:id/viewer", "routes/devices.$id.viewer.tsx");
          route("forgot", "routes/forgot.tsx");
          route("login", "routes/login.tsx");
          route("logout", "routes/logout.tsx");
          route("reset", "routes/reset.tsx");
          route("rules", "routes/rules.tsx");
          route("signup", "routes/signup.tsx");
        });
      },
    }),
    tsconfigPaths(),
  ],
});
