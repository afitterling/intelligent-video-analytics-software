import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { readSession } from "~/lib/session.server.js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const s = await readSession(request);
  return { authed: !!s };
};

export default function Index() {
  const { authed } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Intelligent Video Analytics</h1>
      <p>
        Sign in to register cameras, push live video to your private Kinesis
        Video Stream, and set up AI alerts (people, vehicles, fire, …).
      </p>
      {authed ? (
        <p>
          <Link to="/devices">Go to your devices →</Link>
        </p>
      ) : (
        <p>
          <Link to="/signup">Create an account</Link> or <Link to="/login">sign in</Link>.
        </p>
      )}
    </div>
  );
}
