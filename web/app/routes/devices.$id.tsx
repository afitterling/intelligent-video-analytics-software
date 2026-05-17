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
  const action = useActionData<typeof action>();
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{device.name}</h2>
        <Link to={`/devices/${device.deviceId}/viewer`}>view live →</Link>
      </div>
      <p className="muted">Stream: <code>{device.streamName}</code></p>
      <p className="muted">Status: <span className="pill">{device.status}</span></p>

      <h3>Edit</h3>
      <Form method="post">
        <input type="hidden" name="intent" value="save" />
        <input name="name" defaultValue={device.name} required />
        <input name="location" defaultValue={device.location ?? ""} placeholder="location" />
        <button type="submit">Save</button>
      </Form>
      {action && "saved" in action && <p>Saved.</p>}

      <h3>Registration token</h3>
      <p>Rotate to revoke any existing agent and get a new token to paste into a fresh device.</p>
      <Form method="post">
        <input type="hidden" name="intent" value="rotate" />
        <button type="submit">Rotate registration token</button>
      </Form>
      {action && "rotated" in action && (
        <pre style={{ background: "#0001", padding: 12, overflow: "auto" }}>
          <code>{action.rotated.registrationToken}</code>
        </pre>
      )}

      <h3 className="danger">Danger</h3>
      <Form
        method="post"
        onSubmit={(e) => {
          if (!confirm("Delete this device? The Kinesis stream and all data go with it.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="delete" />
        <button type="submit" className="danger">Delete device</button>
      </Form>
      {action && "error" in action && <p className="danger">{action.error}</p>}
    </div>
  );
}
