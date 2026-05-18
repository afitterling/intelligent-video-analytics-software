import type { ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  try {
    await api("/auth/forgot", { method: "POST", body: { email } });
    return { sent: true, email };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "request failed" };
  }
};

export default function Forgot() {
  const data = useActionData<typeof action>();
  if (data && "sent" in data) {
    return (
      <div className="auth-layout">
        <div className="panel auth-card p-4 p-md-5 text-center">
          <span className="badge text-bg-success mb-3">Sent</span>
          <h1 className="h2 mb-3">Code sent</h1>
          <p className="muted">Check your email for the reset code, then continue.</p>
          <Link to={`/reset?email=${encodeURIComponent(data.email)}`} className="btn btn-primary">Reset password</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="auth-layout">
      <div className="panel auth-card p-4 p-md-5">
      <p className="eyebrow mb-2">Account recovery</p>
      <h1 className="h2 mb-3">Forgot password</h1>
      <p className="muted">Enter your email and we’ll send a reset code.</p>
      <Form method="post" className="d-grid gap-3">
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-control form-control-lg" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <button className="btn btn-primary btn-lg" type="submit">Send reset code</button>
        {data && "error" in data && <div className="alert alert-danger mb-0">{data.error}</div>}
      </Form>
      </div>
    </div>
  );
}
