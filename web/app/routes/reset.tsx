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
  if (data?.done) {
    return (
      <div>
        <h2>Password updated</h2>
        <p><Link to="/login">Sign in →</Link></p>
      </div>
    );
  }
  return (
    <div>
      <h2>Reset password</h2>
      <Form method="post">
        <input name="email" type="email" defaultValue={email} required />
        <input name="code" placeholder="code from email" required />
        <input name="password" type="password" placeholder="new password" required />
        <button type="submit">Reset</button>
        {data?.error && <p className="danger">{data.error}</p>}
      </Form>
    </div>
  );
}
