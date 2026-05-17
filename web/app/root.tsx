import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  useLoaderData,
} from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { readSession } from "./lib/session.server.js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const s = await readSession(request);
  return { email: s?.email ?? null };
};

export default function App() {
  const { email } = useLoaderData<typeof loader>();
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>IVA</title>
        <Meta />
        <Links />
        <style>{`
          :root { color-scheme: light dark; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; }
          header { padding: 12px 20px; border-bottom: 1px solid #ccc4; display: flex; gap: 16px; align-items: center; }
          header a { color: inherit; text-decoration: none; }
          header a.active { font-weight: 600; }
          main { padding: 20px; max-width: 1100px; margin: 0 auto; }
          form { display: flex; flex-direction: column; gap: 10px; max-width: 360px; }
          form input, form select, form textarea { padding: 8px; font: inherit; }
          button { padding: 8px 14px; font: inherit; cursor: pointer; }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ccc4; }
          .row { display: flex; gap: 12px; align-items: center; }
          .pill { padding: 2px 8px; border-radius: 999px; background: #88f3; font-size: 12px; }
          .danger { color: #b00; }
          .muted { color: #888; }
          code { background: #ccc4; padding: 2px 6px; border-radius: 4px; }
        `}</style>
      </head>
      <body>
        <header>
          <Link to="/">IVA</Link>
          {email ? (
            <>
              <Link to="/devices">Devices</Link>
              <Link to="/rules">Rules</Link>
              <span style={{ marginLeft: "auto" }} className="muted">{email}</span>
              <form action="/logout" method="post" style={{ all: "unset" }}>
                <button type="submit">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <span style={{ marginLeft: "auto" }} />
              <Link to="/login">Sign in</Link>
              <Link to="/signup">Sign up</Link>
            </>
          )}
        </header>
        <main>
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
