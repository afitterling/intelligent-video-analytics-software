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
      <div>
        <h2>Account confirmed</h2>
        <p><Link to="/login">Sign in →</Link></p>
      </div>
    );
  }
  if (data?.step === "confirm") {
    return (
      <div>
        <h2>Confirm your email</h2>
        <p>We sent a code to {data.email}. Enter it below.</p>
        <Form method="post">
          <input type="hidden" name="step" value="confirm" />
          <input type="hidden" name="email" value={data.email} />
          <input name="code" placeholder="confirmation code" required />
          <button type="submit">Confirm</button>
          {data?.error && <p className="danger">{data.error}</p>}
        </Form>
      </div>
    );
  }
  return (
    <div>
      <h2>Create your account</h2>
      <Form method="post">
        <input type="hidden" name="step" value="signup" />
        <input name="email" type="email" placeholder="email" required />
        <input name="password" type="password" placeholder="password (10+ chars, mixed case, digit)" required />
        <button type="submit">Sign up</button>
        {data?.error && <p className="danger">{data.error}</p>}
      </Form>
      <p><Link to="/login">Already have an account? Sign in</Link></p>
    </div>
  );
}
