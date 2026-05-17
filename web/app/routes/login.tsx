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
    <div>
      <h2>Sign in</h2>
      <Form method="post">
        <input name="email" type="email" placeholder="email" required />
        <input name="password" type="password" placeholder="password" required />
        <button type="submit">Sign in</button>
        {data?.error && <p className="danger">{data.error}</p>}
      </Form>
      <p>
        <Link to="/forgot">Forgot password?</Link> ·{" "}
        <Link to="/signup">Create account</Link>
      </p>
    </div>
  );
}
