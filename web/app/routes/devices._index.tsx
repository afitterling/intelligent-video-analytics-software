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
      <div className="section-header">
        <div>
          <p className="eyebrow mb-2">Fleet</p>
          <h1 className="h2 mb-0">Devices</h1>
        </div>
        <Link to="/devices/new" className="btn btn-primary">Register a device</Link>
      </div>
      {devices.length === 0 ? (
        <div className="empty-state">
          <h2 className="h5">No devices yet</h2>
          <p className="muted mb-3">Register one to get a streaming token.</p>
          <Link to="/devices/new" className="btn btn-primary">Register a device</Link>
        </div>
      ) : (
        <div className="panel table-responsive">
        <table className="table table-hover align-middle">
          <thead>
            <tr><th>Name</th><th>Location</th><th>Status</th><th>Last seen</th><th></th></tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.deviceId}>
                <td className="fw-semibold"><Link to={`/devices/${d.deviceId}`}>{d.name}</Link></td>
                <td>{d.location || <span className="muted">—</span>}</td>
                <td><span className="status-badge">{d.status}</span></td>
                <td>{d.lastSeenAt ?? <span className="muted">never</span>}</td>
                <td className="text-end"><Link to={`/devices/${d.deviceId}/viewer`} className="btn btn-sm btn-outline-primary">View live</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
