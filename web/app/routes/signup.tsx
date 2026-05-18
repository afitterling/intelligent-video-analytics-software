import type { ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "");
  const step = String(form.get("step") ?? "signup");

  try {
    if (step === "signup") {
      await api("/auth/signup", { method: "POST", body: { email, password } });
      return { step: "confirm" as const, email };
    }
    await api("/auth/confirm", { method: "POST", body: { email, code } });
    return { step: "done" as const, email };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message
      : err instanceof Error ? err.message
      : String(err);
    console.error("signup action failed:", err);
    return { error: message, step };
  }
};

export default function Signup() {
  const data = useActionData<typeof action>();
  if (data?.step === "done") {
    return (
      <div className="auth-layout">
        <div className="panel auth-card p-4 p-md-5 text-center">
          <span className="badge text-bg-success mb-3">Confirmed</span>
          <h1 className="h2 mb-3">Account confirmed</h1>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    );
  }
  if (data?.step === "confirm" && "email" in data) {
    return (
      <div className="auth-layout">
        <div className="panel auth-card p-4 p-md-5">
        <p className="eyebrow mb-2">One more step</p>
        <h1 className="h2 mb-3">Confirm your email</h1>
        <p className="muted">We sent a code to {data.email}. Enter it below.</p>
        <Form method="post" className="d-grid gap-3">
          <input type="hidden" name="step" value="confirm" />
          <input type="hidden" name="email" value={data.email} />
          <div>
            <label className="form-label" htmlFor="code">Confirmation code</label>
            <input id="code" className="form-control form-control-lg" name="code" placeholder="123456" required />
          </div>
          <button className="btn btn-primary btn-lg" type="submit">Confirm</button>
          {data && "error" in data && typeof data.error === "string" && (
            <div className="alert alert-danger mb-0">{data.error}</div>
          )}
        </Form>
        </div>
      </div>
    );
  }
  return (
    <div className="auth-layout">
      <div className="panel auth-card p-4 p-md-5">
      <p className="eyebrow mb-2">Start monitoring</p>
      <h1 className="h2 mb-4">Create your account</h1>
      <Form method="post" className="d-grid gap-3">
        <input type="hidden" name="step" value="signup" />
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-control form-control-lg" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <div>
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" className="form-control form-control-lg" name="password" type="password" placeholder="10+ chars, mixed case, digit" required />
        </div>
        <button className="btn btn-primary btn-lg" type="submit">Sign up</button>
        {data && "error" in data && <div className="alert alert-danger mb-0">{data.error}</div>}
      </Form>
      <p className="small mt-4 mb-0"><Link to="/login">Already have an account? Sign in</Link></p>
      </div>
    </div>
  );
}
