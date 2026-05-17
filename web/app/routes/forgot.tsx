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
  if (data?.sent) {
    return (
      <div>
        <h2>Code sent</h2>
        <p>Check your email for the reset code, then continue.</p>
        <p><Link to={`/reset?email=${encodeURIComponent(data.email)}`}>Reset password →</Link></p>
      </div>
    );
  }
  return (
    <div>
      <h2>Forgot password</h2>
      <Form method="post">
        <input name="email" type="email" placeholder="email" required />
        <button type="submit">Send reset code</button>
        {data?.error && <p className="danger">{data.error}</p>}
      </Form>
    </div>
  );
}
