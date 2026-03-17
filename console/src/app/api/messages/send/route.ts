import { createServiceClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

const SPLYT_ADMIN_ID = "00000000-0000-0000-0000-000000000000";
const SPLYT_ADMIN_NAME = "SPLYT";
const SPLYT_ADMIN_AVATAR = "/splyt-admin-avatar.svg";

export async function POST(req: Request) {
  const supabase = createServiceClient();
  const body = await req.json();

  const { thread_id, content, recipient_id, experience_id, experience_title } =
    body;

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 },
    );
  }

  let targetThreadId = thread_id;

  // If no thread_id, create a new DM thread or experience thread
  if (!targetThreadId) {
    if (recipient_id) {
      // Create a DM thread
      const { data: existing } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("is_direct_message", true)
        .contains("member_ids", [SPLYT_ADMIN_ID, recipient_id])
        .limit(1)
        .single();

      if (existing) {
        targetThreadId = existing.id;
      } else {
        const { data: newThread, error: threadError } = await supabase
          .from("chat_threads")
          .insert({
            experience_title: "SPLYT Support",
            is_direct_message: true,
            member_ids: [SPLYT_ADMIN_ID, recipient_id],
          })
          .select("id")
          .single();

        if (threadError) {
          return NextResponse.json(
            { error: threadError.message },
            { status: 500 },
          );
        }
        targetThreadId = newThread.id;
      }
    } else if (experience_id && experience_title) {
      // Get or create experience thread
      const { data: existing } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("experience_id", experience_id)
        .limit(1)
        .single();

      if (existing) {
        targetThreadId = existing.id;
      } else {
        return NextResponse.json(
          { error: "Experience thread not found" },
          { status: 404 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "thread_id, recipient_id, or experience_id required" },
        { status: 400 },
      );
    }
  }

  // Send the message as SPLYT Admin
  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: targetThreadId,
      sender_id: SPLYT_ADMIN_ID,
      sender_name: SPLYT_ADMIN_NAME,
      sender_avatar_url: SPLYT_ADMIN_AVATAR,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update thread updated_at
  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", targetThreadId);

  return NextResponse.json({ message, thread_id: targetThreadId });
}
