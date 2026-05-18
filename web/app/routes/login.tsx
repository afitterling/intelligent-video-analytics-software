import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useActionData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";
import { commitSession, getSession } from "~/lib/session.server.js";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  try {
    const r = await api<{ refreshToken: string }>(
      "/auth/login",
      { method: "POST", body: { email, password } },
    );
    const session = await getSession(request);
    session.set("data", { refreshToken: r.refreshToken, email });
    return redirect("/devices", { headers: { "Set-Cookie": await commitSession(session) } });
  } catch (err) {
    console.error("login action failed:", err);
    const message =
      err instanceof ApiError ? err.message
      : err instanceof Error ? err.message
      : String(err);
    return { error: message };
  }
};

export default function Login() {
  const data = useActionData<typeof action>();
  return (
    <div className="auth-layout">
      <div className="panel auth-card p-4 p-md-5">
        <p className="eyebrow mb-2">Welcome back</p>
        <h1 className="h2 mb-4">Sign in</h1>
      <Form method="post" className="d-grid gap-3">
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-control form-control-lg" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <div>
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" className="form-control form-control-lg" name="password" type="password" placeholder="Your password" required />
        </div>
        <button className="btn btn-primary btn-lg" type="submit">Sign in</button>
        {data?.error && <div className="alert alert-danger mb-0">{data.error}</div>}
      </Form>
      <div className="d-flex justify-content-between gap-3 mt-4 small">
        <Link to="/forgot">Forgot password?</Link>
        <Link to="/signup">Create account</Link>
      </div>
      </div>
    </div>
  );
}
