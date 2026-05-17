import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";
import { requireSession } from "~/lib/session.server.js";

const LABELS = ["Person", "Vehicle", "Animal", "Pet", "Weapon", "Fire", "Smoke", "Package"];

interface Rule {
  ruleId: string;
  deviceId: string;
  name: string;
  detect: string[];
  minConfidence: number;
  action: { type: "email" | "webhook" | "log"; to?: string; url?: string };
  enabled: boolean;
}

interface Device { deviceId: string; name: string }

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const s = await requireSession(request);
  const [rulesRes, devicesRes] = await Promise.all([
    api<{ rules: Rule[] }>("/rules", { token: s.accessToken }),
    api<{ devices: Device[] }>("/devices", { token: s.accessToken }),
  ]);
  return { rules: rulesRes.rules, devices: devicesRes.devices, email: s.email };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const s = await requireSession(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  try {
    if (intent === "delete") {
      const id = String(form.get("ruleId"));
      await api(`/rules/${id}`, { method: "DELETE", token: s.accessToken });
      return { deleted: id };
    }
    if (intent === "toggle") {
      const id = String(form.get("ruleId"));
      const enabled = form.get("enabled") === "true";
      await api(`/rules/${id}`, { method: "PUT", token: s.accessToken, body: { enabled } });
      return { toggled: id };
    }
    const name = String(form.get("name") ?? "");
    const deviceId = String(form.get("deviceId") ?? "*");
    const detect = form.getAll("detect").map(String);
    const minConfidence = Number(form.get("minConfidence") ?? 75);
    const actionType = String(form.get("actionType") ?? "log") as Rule["action"]["type"];
    const target = String(form.get("target") ?? "");
    const action: Rule["action"] =
      actionType === "email" ? { type: "email", to: target }
      : actionType === "webhook" ? { type: "webhook", url: target }
      : { type: "log" };
    await api("/rules", {
      method: "POST",
      token: s.accessToken,
      body: { name, deviceId, detect, minConfidence, action },
    });
    return { created: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "rule action failed" };
  }
};

export default function Rules() {
  const { rules, devices, email } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return (
    <div>
      <h2>Detection rules</h2>
      <p className="muted">When a rule matches, the detector fires its action (with a 1-hour per-device cooldown).</p>

      <h3>Existing rules</h3>
      {rules.length === 0 ? (
        <p className="muted">No rules yet.</p>
      ) : (
        <table>
          <thead><tr><th>Name</th><th>Device</th><th>Detect</th><th>Action</th><th>Enabled</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.ruleId}>
                <td>{r.name}</td>
                <td>{r.deviceId === "*" ? "all" : (devices.find(d => d.deviceId === r.deviceId)?.name ?? r.deviceId)}</td>
                <td>{r.detect.join(", ")} ≥ {r.minConfidence}%</td>
                <td>{r.action.type}{r.action.type === "email" ? `: ${r.action.to}` : r.action.type === "webhook" ? `: ${r.action.url}` : ""}</td>
                <td>
                  <fetcher.Form method="post" style={{ all: "unset" }}>
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="ruleId" value={r.ruleId} />
                    <input type="hidden" name="enabled" value={r.enabled ? "false" : "true"} />
                    <button type="submit">{r.enabled ? "on" : "off"}</button>
                  </fetcher.Form>
                </td>
                <td>
                  <fetcher.Form method="post" style={{ all: "unset" }}>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="ruleId" value={r.ruleId} />
                    <button type="submit" className="danger">delete</button>
                  </fetcher.Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>New rule</h3>
      <Form method="post">
        <input name="name" placeholder="Front door — anyone" required />
        <label>
          Device
          <select name="deviceId" defaultValue="*">
            <option value="*">All devices</option>
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.name}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Detect</legend>
          {LABELS.map((l) => (
            <label key={l} style={{ display: "inline-block", marginRight: 8 }}>
              <input type="checkbox" name="detect" value={l} defaultChecked={l === "Person"} /> {l}
            </label>
          ))}
        </fieldset>
        <label>
          Min confidence (%)
          <input name="minConfidence" type="number" defaultValue={75} min={50} max={99} />
        </label>
        <label>
          Action
          <select name="actionType" defaultValue="email">
            <option value="email">Email</option>
            <option value="webhook">Webhook (POST)</option>
            <option value="log">Log only</option>
          </select>
        </label>
        <input name="target" placeholder={`email or URL (e.g. ${email})`} />
        <button type="submit">Create rule</button>
      </Form>
    </div>
  );
}
