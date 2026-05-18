import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  useLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { readSession } from "./lib/session.server.js";
import appStylesHref from "./styles/app.css?url";

export const links: LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  },
  { rel: "stylesheet", href: appStylesHref },
];

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
      </head>
      <body className="app-shell">
        <nav className="navbar navbar-expand app-nav sticky-top">
          <div className="container-fluid main-container py-0">
          <Link to="/" className="navbar-brand d-flex align-items-center gap-2">
            <span className="brand-mark">IVA</span>
            <span>Intelligent Video Analytics</span>
          </Link>
          <div className="navbar-nav ms-auto align-items-center gap-2">
          {email ? (
            <>
              <Link to="/devices" className="nav-link">Devices</Link>
              <Link to="/rules" className="nav-link">Rules</Link>
              <span className="d-none d-md-inline small muted px-2">{email}</span>
              <form action="/logout" method="post" className="m-0">
                <button type="submit" className="btn btn-sm btn-outline-secondary">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">Sign in</Link>
              <Link to="/signup" className="btn btn-sm btn-primary">Sign up</Link>
            </>
          )}
          </div>
          </div>
        </nav>
        <main className="main-container">
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
