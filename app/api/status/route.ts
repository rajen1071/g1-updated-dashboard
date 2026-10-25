import { refreshedAt } from "@/lib/cache";
export const dynamic = "force-dynamic";

// When the data was last refreshed, so the daily data load can skip a day that is already loaded.
export async function GET() {
  const at = await refreshedAt();
  return Response.json({ refreshedAt: at ? new Date(at).toISOString() : null });
}
