import { cookies } from "next/headers";
import { findReadableAsset, readAssetBytes } from "@openexam/core/assets";
import { getSessionByToken, userHasRole } from "@openexam/core/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const webSessionCookieName = "openexam_web_session";
const adminSessionCookieName = "openexam_admin_session";

type AssetRouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

export async function GET(_request: Request, context: AssetRouteContext) {
  const params = await context.params;
  const cookieStore = await cookies();
  const [webSession, adminSession] = await Promise.all([
    getSessionByToken(cookieStore.get(webSessionCookieName)?.value, "web"),
    getSessionByToken(cookieStore.get(adminSessionCookieName)?.value, "admin")
  ]);
  const session = webSession ?? adminSession;

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const readable = await findReadableAsset(params.assetId, {
    userId: session.user.id,
    isAdmin: userHasRole(webSession?.user, "admin") || userHasRole(adminSession?.user, "admin")
  });

  if (!readable.ok) {
    return new Response(readable.error, { status: readable.status });
  }

  const bytes = await readAssetBytes(readable.data).catch(() => null);

  if (!bytes) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Content-Length": String(bytes.length),
      "Content-Type": readable.data.mimeType
    }
  });
}
