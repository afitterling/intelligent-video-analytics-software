import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { destroySession, getSession } from "~/lib/session.server.js";

export const action = async ({ request }: ActionFunctionArgs) => {
  const session = await getSession(request);
  return redirect("/", { headers: { "Set-Cookie": await destroySession(session) } });
};

export const loader = action;
