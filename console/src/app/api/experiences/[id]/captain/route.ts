import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/experiences/:id/captain — Assign captain to experience
 *
 * Body: { captain_id: string }
 *
 * 1. Sets experiences.captain_id
 * 2. Calls create_captain_profile() RPC to get/create shadow profile
 * 3. Adds captain to experience chat thread via member_ids
 * 4. Inserts experience_participants row with role = 'captain'
 * 5. Posts system message: "Captain [Name] has joined the crew"
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: experienceId } = await params;
  const body = await request.json();
  const { captain_id } = body;

  if (!captain_id) {
    return NextResponse.json({ error: "captain_id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Get captain info
  const { data: captain, error: captainErr } = await supabase
    .from("captains")
    .select("id, name, avatar_url, profile_id")
    .eq("id", captain_id)
    .single();

  if (captainErr || !captain) {
    return NextResponse.json({ error: "Captain not found" }, { status: 404 });
  }

  // 2. Set captain_id on experience
  const { error: expErr } = await supabase
    .from("experiences")
    .update({ captain_id })
    .eq("id", experienceId);

  if (expErr) {
    return NextResponse.json({ error: expErr.message }, { status: 500 });
  }

  // 3. Get or create shadow profile for captain
  let profileId = captain.profile_id;

  if (!profileId) {
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc("create_captain_profile", { p_captain_id: captain_id });

    if (rpcErr) {
      console.error("Shadow profile creation failed:", rpcErr);
      // Non-fatal — captain is still assigned, just won't be in chat
    } else {
      profileId = rpcResult;
    }
  }

  // 4. Add captain to chat thread
  if (profileId) {
    // Find the experience's chat thread
    const { data: thread } = await supabase
      .from("chat_threads")
      .select("id, member_ids")
      .eq("experience_id", experienceId)
      .limit(1)
      .single();

    if (thread) {
      const memberIds: string[] = thread.member_ids ?? [];
      if (!memberIds.includes(profileId)) {
        await supabase
          .from("chat_threads")
          .update({
            member_ids: [...memberIds, profileId],
            updated_at: new Date().toISOString(),
          })
          .eq("id", thread.id);

        // 5. Post system message
        await supabase.from("chat_messages").insert({
          thread_id: thread.id,
          sender_id: profileId,
          content: `Captain ${captain.name} has joined the crew`,
          message_type: "system",
        });
      }
    }

    // 6. Add to experience_participants with captain role
    await supabase.from("experience_participants").upsert(
      {
        experience_id: experienceId,
        user_id: profileId,
        role: "captain",
        status: "active",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "experience_id,user_id" },
    );
  }

  return NextResponse.json({
    success: true,
    captain_id,
    profile_id: profileId,
    captain_name: captain.name,
  });
}

/**
 * DELETE /api/experiences/:id/captain — Remove captain from experience
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id: experienceId } = await params;

  const supabase = createServiceClient();

  // Get current captain before removing
  const { data: experience } = await supabase
    .from("experiences")
    .select("captain_id")
    .eq("id", experienceId)
    .single();

  if (!experience?.captain_id) {
    return NextResponse.json({ error: "No captain assigned" }, { status: 400 });
  }

  // Remove captain_id from experience
  await supabase
    .from("experiences")
    .update({ captain_id: null })
    .eq("id", experienceId);

  return NextResponse.json({ success: true });
}
