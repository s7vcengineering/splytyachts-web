import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createServiceClient();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";

  if (!q || q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, email")
    .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}
