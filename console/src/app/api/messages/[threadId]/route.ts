import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const supabase = createServiceClient();

  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select(
      "id, thread_id, sender_id, sender_name, sender_avatar_url, content, image_url, is_pinned, created_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: messages || [] });
}
