import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/captains/search?q=john — Search captains by name */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";

  if (q.length < 2) {
    return NextResponse.json({ captains: [] });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("captains")
    .select("id, name, avatar_url, rating, boats_count, source")
    .ilike("name", `%${q}%`)
    .eq("is_active", true)
    .order("boats_count", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ captains: data ?? [] });
}
