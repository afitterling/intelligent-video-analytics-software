import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { api, ApiError } from "~/lib/api.server.js";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return { email: url.searchParams.get("email") ?? "" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const code = String(form.get("code") ?? "");
  const password = String(form.get("password") ?? "");
  try {
    await api("/auth/reset", { method: "POST", body: { email, code, password } });
    return { done: true };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "reset failed" };
  }
};

export default function Reset() {
  const { email } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  if (data && "done" in data) {
    return (
      <div className="auth-layout">
        <div className="panel auth-card p-4 p-md-5 text-center">
          <span className="badge text-bg-success mb-3">Updated</span>
          <h1 className="h2 mb-3">Password updated</h1>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="auth-layout">
      <div className="panel auth-card p-4 p-md-5">
      <p className="eyebrow mb-2">Account recovery</p>
      <h1 className="h2 mb-4">Reset password</h1>
      <Form method="post" className="d-grid gap-3">
        <div>
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="form-control form-control-lg" name="email" type="email" defaultValue={email} required />
        </div>
        <div>
          <label className="form-label" htmlFor="code">Reset code</label>
          <input id="code" className="form-control form-control-lg" name="code" placeholder="Code from email" required />
        </div>
        <div>
          <label className="form-label" htmlFor="password">New password</label>
          <input id="password" className="form-control form-control-lg" name="password" type="password" placeholder="New password" required />
        </div>
        <button className="btn btn-primary btn-lg" type="submit">Reset</button>
        {data && "error" in data && <div className="alert alert-danger mb-0">{data.error}</div>}
      </Form>
      </div>
    </div>
  );
}
