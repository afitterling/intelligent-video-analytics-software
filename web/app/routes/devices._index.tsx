import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { api } from "~/lib/api.server.js";
import { requireSession } from "~/lib/session.server.js";

interface Device {
  deviceId: string;
  name: string;
  location?: string;
  status: string;
  lastSeenAt?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const s = await requireSession(request);
  const { devices } = await api<{ devices: Device[] }>("/devices", { token: s.accessToken });
  return { devices };
};

export default function Devices() {
  const { devices } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Devices</h2>
        <Link to="/devices/new"><button>+ Register a device</button></Link>
      </div>
      {devices.length === 0 ? (
        <p className="muted">No devices yet. Register one to get a streaming token.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Location</th><th>Status</th><th>Last seen</th><th></th></tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.deviceId}>
                <td><Link to={`/devices/${d.deviceId}`}>{d.name}</Link></td>
                <td>{d.location || <span className="muted">—</span>}</td>
                <td><span className="pill">{d.status}</span></td>
                <td>{d.lastSeenAt ?? <span className="muted">never</span>}</td>
                <td><Link to={`/devices/${d.deviceId}/viewer`}>view live →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
