// Browser-side caller for the server actions in src/app/api/fn/[name]/route.ts.
// Errors carry the same `functions/<code>` codes httpsCallable used, so
// friendlyError() and the vendor link page handle them unchanged.
import { auth } from "./firebase";

export class ApiCallError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function callApi<Res>(name: string, data: unknown): Promise<Res> {
  const token = await auth.currentUser?.getIdToken();
  let res: Response;
  try {
    res = await fetch(`/api/fn/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ data }),
    });
  } catch {
    throw new ApiCallError("functions/unavailable", "Can't reach the server.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !("data" in body)) {
    const err = body?.error as { code?: string; message?: string } | undefined;
    throw new ApiCallError(`functions/${err?.code ?? "internal"}`, err?.message ?? "Something went wrong on the server.");
  }
  return body.data as Res;
}
