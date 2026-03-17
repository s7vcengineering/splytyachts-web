import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/captains/:id/create-profile — Create shadow profile for captain */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const supabase = createServiceClient();

  // Check captain exists
  const { data: captain } = await supabase
    .from("captains")
    .select("id, name, profile_id")
    .eq("id", id)
    .single();

  if (!captain) {
    return NextResponse.json({ error: "Captain not found" }, { status: 404 });
  }

  if (captain.profile_id) {
    return NextResponse.json({
      success: true,
      profile_id: captain.profile_id,
      message: "Profile already exists",
    });
  }

  // Call the RPC to create shadow profile
  const { data: profileId, error } = await supabase.rpc("create_captain_profile", {
    p_captain_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    profile_id: profileId,
  });
}
