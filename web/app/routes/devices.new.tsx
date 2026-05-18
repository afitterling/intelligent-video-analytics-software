import type { ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";
import { requireSession } from "~/lib/session.server.js";

interface CreateResponse {
  device: { deviceId: string; name: string };
  registrationToken: string;
  registrationTokenExpiresAt: number;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const s = await requireSession(request);
  const form = await request.formData();
  const name = String(form.get("name") ?? "");
  const location = String(form.get("location") ?? "");
  try {
    const r = await api<CreateResponse>("/devices", {
      method: "POST",
      token: s.accessToken,
      body: { name, location },
    });
    return r;
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "create failed" };
  }
};

export default function NewDevice() {
  const data = useActionData<typeof action>();
  if (data && "registrationToken" in data) {
    const expires = new Date(data.registrationTokenExpiresAt * 1000);
    return (
      <div className="panel p-4 p-md-5">
        <span className="badge text-bg-success mb-3">Registered</span>
        <h1 className="h2 mb-3">{data.device.name} registered</h1>
        <p className="muted">
          Paste this token into the macOS agent or mobile app on the device.
          It expires {expires.toLocaleString()} and won't be shown again.
        </p>
        <pre className="code-block">
          <code>{data.registrationToken}</code>
        </pre>
        <Link to={`/devices/${data.device.deviceId}`} className="btn btn-primary">Open device</Link>
      </div>
    );
  }
  return (
    <div className="panel form-card p-4 p-md-5">
      <p className="eyebrow mb-2">New camera</p>
      <h1 className="h2 mb-4">Register a device</h1>
      <Form method="post" className="d-grid gap-3">
        <div>
          <label className="form-label" htmlFor="name">Device name</label>
          <input id="name" className="form-control form-control-lg" name="name" placeholder="Front door cam" required />
        </div>
        <div>
          <label className="form-label" htmlFor="location">Location</label>
          <input id="location" className="form-control form-control-lg" name="location" placeholder="Entrance" />
        </div>
        <button className="btn btn-primary btn-lg" type="submit">Create</button>
        {data && "error" in data && <div className="alert alert-danger mb-0">{data.error}</div>}
      </Form>
    </div>
  );
}
