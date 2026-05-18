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
      <div className="section-header">
        <div>
          <p className="eyebrow mb-2">Automation</p>
          <h1 className="h2 mb-1">Detection rules</h1>
          <p className="muted mb-0">When a rule matches, the detector fires its action with a 1-hour per-device cooldown.</p>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="empty-state mb-4">
          <h2 className="h5">No rules yet</h2>
          <p className="muted mb-0">Create a rule below to start alerting from detections.</p>
        </div>
      ) : (
        <div className="panel table-responsive mb-4">
        <table className="table table-hover align-middle">
          <thead><tr><th>Name</th><th>Device</th><th>Detect</th><th>Action</th><th>Enabled</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.ruleId}>
                <td className="fw-semibold">{r.name}</td>
                <td>{r.deviceId === "*" ? "all" : (devices.find(d => d.deviceId === r.deviceId)?.name ?? r.deviceId)}</td>
                <td>{r.detect.join(", ")} &gt;= {r.minConfidence}%</td>
                <td>{r.action.type}{r.action.type === "email" ? `: ${r.action.to}` : r.action.type === "webhook" ? `: ${r.action.url}` : ""}</td>
                <td>
                  <fetcher.Form method="post" className="m-0">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="ruleId" value={r.ruleId} />
                    <input type="hidden" name="enabled" value={r.enabled ? "false" : "true"} />
                    <button type="submit" className={`btn btn-sm ${r.enabled ? "btn-success" : "btn-outline-secondary"}`}>
                      {r.enabled ? "On" : "Off"}
                    </button>
                  </fetcher.Form>
                </td>
                <td className="text-end">
                  <fetcher.Form method="post" className="m-0">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="ruleId" value={r.ruleId} />
                    <button type="submit" className="btn btn-sm btn-outline-danger">Delete</button>
                  </fetcher.Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <div className="panel p-4 p-md-5">
      <h2 className="h4 mb-4">New rule</h2>
      <Form method="post" className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="name">Rule name</label>
          <input id="name" className="form-control" name="name" placeholder="Front door - anyone" required />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="deviceId">Device</label>
          <select id="deviceId" className="form-select" name="deviceId" defaultValue="*">
            <option value="*">All devices</option>
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.name}</option>)}
          </select>
        </div>
        <fieldset className="col-12">
          <legend className="form-label">Detect</legend>
          <div className="label-grid">
          {LABELS.map((l) => (
            <label key={l} className="label-chip">
              <input className="form-check-input m-0" type="checkbox" name="detect" value={l} defaultChecked={l === "Person"} /> {l}
            </label>
          ))}
          </div>
        </fieldset>
        <div className="col-md-4">
          <label className="form-label" htmlFor="minConfidence">Min confidence (%)</label>
          <input id="minConfidence" className="form-control" name="minConfidence" type="number" defaultValue={75} min={50} max={99} />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="actionType">Action</label>
          <select id="actionType" className="form-select" name="actionType" defaultValue="email">
            <option value="email">Email</option>
            <option value="webhook">Webhook (POST)</option>
            <option value="log">Log only</option>
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="target">Target</label>
          <input id="target" className="form-control" name="target" placeholder={`email or URL (e.g. ${email})`} />
        </div>
        <div className="col-12">
          <button className="btn btn-primary" type="submit">Create rule</button>
        </div>
      </Form>
      </div>
    </div>
  );
}
