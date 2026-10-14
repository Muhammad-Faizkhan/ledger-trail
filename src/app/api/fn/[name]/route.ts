// POST /api/fn/<name> with { data } → { data } or { error: { code, message } }.
// The caller's Firebase ID token, if any, comes in the Authorization header.
import { adminAuth } from "@/lib/server/admin";
import { ApiError, handlers, type ApiErrorCode, type Caller } from "@/lib/server/ledger";

const STATUS: Record<ApiErrorCode, number> = {
  "unauthenticated": 401, "invalid-argument": 400, "not-found": 404, "internal": 500,
};

const fail = (code: ApiErrorCode, message: string) =>
  Response.json({ error: { code, message } }, { status: STATUS[code] });

async function callerOf(req: Request): Promise<Caller | "invalid"> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const token = header.match(/^Bearer (.+)$/)?.[1];
  if (!token) return "invalid";
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const businessId = typeof decoded.businessId === "string" && decoded.businessId ? decoded.businessId : null;
    return { uid: decoded.uid, businessId };
  } catch {
    return "invalid";
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/fn/[name]">) {
  const { name } = await ctx.params;
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
  if (!handler) return fail("not-found", "Unknown action.");

  const caller = await callerOf(req);
  if (caller === "invalid") return fail("unauthenticated", "Your session has expired. Sign in again.");

  let body: { data?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("invalid-argument", "Bad request.");
  }

  try {
    return Response.json({ data: await handler(caller, body?.data ?? null) });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message);
    console.error(`/api/fn/${name} failed`, err);
    return fail("internal", "Something went wrong on the server.");
  }
}
