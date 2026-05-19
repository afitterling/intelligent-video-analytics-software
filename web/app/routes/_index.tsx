import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireSession } from "~/lib/session.server.js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const s = await requireSession(request).catch(() => null);
  if (s) throw redirect("/devices");
  return { authed: !!s };
};

export default function Index() {
  const { authed } = useLoaderData<typeof loader>();
  return (
    <section className="hero">
      <div>
        <p className="eyebrow mb-3">Private real-time monitoring</p>
        <h1 className="hero-title fw-black mb-4">Intelligent Video Analytics</h1>
        <p className="hero-copy mb-4">
          Register cameras, stream securely to your private Kinesis Video Stream,
          and trigger AI alerts for people, vehicles, fire, packages, and more.
        </p>
        <div className="d-flex flex-wrap gap-2">
          {authed ? (
            <Link to="/devices" className="btn btn-primary btn-lg">Open devices</Link>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary btn-lg">Create an account</Link>
              <Link to="/login" className="btn btn-outline-primary btn-lg">Sign in</Link>
            </>
          )}
        </div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="scan-line" />
        <div className="video-label">
          <span className="badge text-bg-success">Live detection</span>
          <span className="small">Person 96% · Package 88%</span>
        </div>
      </div>
    </section>
  );
}
