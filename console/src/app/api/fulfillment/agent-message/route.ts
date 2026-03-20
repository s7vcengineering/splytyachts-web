import { createServiceClient } from "@/lib/supabase";
import { getAgentForStage, formatAgentMessage } from "@/lib/agents";
import { NextResponse } from "next/server";

/**
 * POST /api/fulfillment/agent-message
 *
 * Sends a message to the experience group thread as the pipeline sub-agent
 * assigned to the given stage. Called automatically when an experience
 * advances through the fulfillment pipeline.
 *
 * Body: { experience_id, stage, custom_message? }
 */
export async function POST(req: Request) {
  const supabase = createServiceClient();

  const { experience_id, stage, custom_message } = await req.json();

  if (!experience_id || !stage) {
    return NextResponse.json(
      { error: "Missing experience_id or stage" },
      { status: 400 },
    );
  }

  const agent = getAgentForStage(stage);
  if (!agent) {
    return NextResponse.json(
      { error: `No agent for stage: ${stage}` },
      { status: 400 },
    );
  }

  // Get the experience details for the message template
  const { data: experience, error: expError } = await supabase
    .from("experiences")
    .select("id, title, experience_date")
    .eq("id", experience_id)
    .single();

  if (expError || !experience) {
    return NextResponse.json(
      { error: "Experience not found" },
      { status: 404 },
    );
  }

  // Format the message
  const content =
    custom_message ??
    formatAgentMessage(stage, {
      title: experience.title,
      date: experience.experience_date
        ? new Date(experience.experience_date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : undefined,
    });

  if (!content) {
    return NextResponse.json(
      { error: "Could not generate message" },
      { status: 500 },
    );
  }

  // Find the experience's group thread
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("experience_id", experience_id)
    .limit(1)
    .single();

  if (!thread) {
    // No thread exists yet — skip silently (thread is created when first user message is sent)
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No group thread exists for this experience yet",
    });
  }

  // Send the message as the agent
  const { data: message, error: msgError } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: thread.id,
      sender_id: agent.senderId,
      sender_name: agent.name,
      sender_avatar_url: agent.photo,
      content,
    })
    .select()
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Add agent to thread members if not already present
  const { data: currentThread } = await supabase
    .from("chat_threads")
    .select("member_ids")
    .eq("id", thread.id)
    .single();

  if (currentThread) {
    const memberIds: string[] = currentThread.member_ids ?? [];
    if (!memberIds.includes(agent.senderId)) {
      await supabase
        .from("chat_threads")
        .update({
          member_ids: [...memberIds, agent.senderId],
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread.id);
    } else {
      await supabase
        .from("chat_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", thread.id);
    }
  }

  return NextResponse.json({
    ok: true,
    message,
    agent: agent.name,
    thread_id: thread.id,
  });
}
