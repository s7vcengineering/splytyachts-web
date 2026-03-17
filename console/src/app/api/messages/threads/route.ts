import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createServiceClient();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";

  // Fetch all threads with their latest message
  let query = supabase
    .from("chat_threads")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.ilike("experience_title", `%${q}%`);
  }

  const { data: threads, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get latest message for each thread
  const threadIds = (threads || []).map((t) => t.id);
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("thread_id, content, sender_name, sender_id, created_at")
    .in("thread_id", threadIds.length > 0 ? threadIds : ["none"])
    .order("created_at", { ascending: false });

  // Get unique member IDs across all threads
  const allMemberIds = new Set<string>();
  (threads || []).forEach((t) => {
    (t.member_ids || []).forEach((id: string) => allMemberIds.add(id));
  });

  // Fetch profiles for all members
  const memberIdsArray = Array.from(allMemberIds).filter(
    (id) => id !== "00000000-0000-0000-0000-000000000000",
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, email")
    .in("id", memberIdsArray.length > 0 ? memberIdsArray : ["none"]);

  const profileMap: Record<
    string,
    { display_name: string; avatar_url: string | null; email: string | null }
  > = {};
  (profiles || []).forEach((p) => {
    profileMap[p.id] = p;
  });

  // Build latest message map (first occurrence = latest due to desc order)
  const latestMessageMap: Record<
    string,
    { content: string; sender_name: string; sender_id: string; created_at: string }
  > = {};
  (messages || []).forEach((m) => {
    if (!latestMessageMap[m.thread_id]) {
      latestMessageMap[m.thread_id] = m;
    }
  });

  const enrichedThreads = (threads || []).map((t) => ({
    ...t,
    latest_message: latestMessageMap[t.id] || null,
    members: (t.member_ids || [])
      .filter((id: string) => id !== "00000000-0000-0000-0000-000000000000")
      .map((id: string) => profileMap[id] || { id, display_name: null }),
  }));

  return NextResponse.json({ threads: enrichedThreads, profiles: profileMap });
}
