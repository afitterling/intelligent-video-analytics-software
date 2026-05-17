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
      <div>
        <h2>{data.device.name} registered</h2>
        <p>
          Paste this token into the macOS agent or mobile app on the device.
          It expires {expires.toLocaleString()} and won't be shown again.
        </p>
        <pre style={{ background: "#0001", padding: 12, overflow: "auto" }}>
          <code>{data.registrationToken}</code>
        </pre>
        <p>
          <Link to={`/devices/${data.device.deviceId}`}>Open device →</Link>
        </p>
      </div>
    );
  }
  return (
    <div>
      <h2>Register a device</h2>
      <Form method="post">
        <input name="name" placeholder="Front door cam" required />
        <input name="location" placeholder="(optional) Entrance" />
        <button type="submit">Create</button>
        {data && "error" in data && <p className="danger">{data.error}</p>}
      </Form>
    </div>
  );
}
