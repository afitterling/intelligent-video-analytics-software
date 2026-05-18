import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";
import { requireSession } from "~/lib/session.server.js";

interface Device {
  deviceId: string;
  name: string;
  location?: string;
  status: string;
  streamName: string;
  createdAt: string;
  lastSeenAt?: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const s = await requireSession(request);
  const { device } = await api<{ device: Device }>(`/devices/${params.id}`, { token: s.accessToken });
  return { device };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const s = await requireSession(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "save") {
      const name = String(form.get("name") ?? "");
      const location = String(form.get("location") ?? "");
      await api(`/devices/${params.id}`, {
        method: "PUT",
        token: s.accessToken,
        body: { name, location },
      });
      return { saved: true };
    }
    if (intent === "rotate") {
      const r = await api<{ registrationToken: string; registrationTokenExpiresAt: number }>(
        `/devices/${params.id}/rotate-token`,
        { method: "POST", token: s.accessToken },
      );
      return { rotated: r };
    }
    if (intent === "delete") {
      await api(`/devices/${params.id}`, { method: "DELETE", token: s.accessToken });
      return redirect("/devices");
    }
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "action failed" };
  }
  return null;
};

export default function DeviceDetail() {
  const { device } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div>
      <div className="section-header">
        <div>
          <p className="eyebrow mb-2">Device</p>
          <h1 className="h2 mb-1">{device.name}</h1>
          <div className="d-flex flex-wrap gap-2 align-items-center muted">
            <span>Status: <span className="status-badge">{device.status}</span></span>
            <span>Stream: <code>{device.streamName}</code></span>
          </div>
        </div>
        <Link to={`/devices/${device.deviceId}/viewer`} className="btn btn-primary">View live</Link>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="panel p-4">
      <h2 className="h4 mb-3">Edit details</h2>
      <Form method="post" className="d-grid gap-3">
        <input type="hidden" name="intent" value="save" />
        <div>
          <label className="form-label" htmlFor="name">Name</label>
          <input id="name" className="form-control" name="name" defaultValue={device.name} required />
        </div>
        <div>
          <label className="form-label" htmlFor="location">Location</label>
          <input id="location" className="form-control" name="location" defaultValue={device.location ?? ""} placeholder="Entrance" />
        </div>
        <button className="btn btn-primary" type="submit">Save</button>
      </Form>
      {actionData && "saved" in actionData && <div className="alert alert-success mt-3 mb-0">Saved.</div>}
          </div>
        </div>

        <div className="col-lg-5">
          <div className="panel p-4">
      <h2 className="h4 mb-3">Registration token</h2>
      <p className="muted">Rotate to revoke any existing agent and get a new token to paste into a fresh device.</p>
      <Form method="post" className="mb-3">
        <input type="hidden" name="intent" value="rotate" />
        <button className="btn btn-outline-primary" type="submit">Rotate registration token</button>
      </Form>
      {actionData && "rotated" in actionData && (
        <pre className="code-block mb-0">
          <code>{actionData.rotated.registrationToken}</code>
        </pre>
      )}
          </div>
        </div>
      </div>

      <div className="panel p-4 mt-4 border-danger-subtle">
      <h2 className="h4 danger mb-2">Danger zone</h2>
      <p className="muted">Deleting this device removes its Kinesis stream and data.</p>
      <Form
        method="post"
        onSubmit={(e) => {
          if (!confirm("Delete this device? The Kinesis stream and all data go with it.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="delete" />
        <button type="submit" className="btn btn-outline-danger">Delete device</button>
      </Form>
      {actionData && "error" in actionData && <div className="alert alert-danger mt-3 mb-0">{actionData.error}</div>}
      </div>
    </div>
  );
}
