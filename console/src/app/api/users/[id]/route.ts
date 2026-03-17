import { createServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/users/:id — Update user profile fields */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    "display_name",
    "email",
    "role",
    "home_city",
    "wallet_balance",
    "is_premium",
    "premium_until",
    "bio",
    "onboarding_complete",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  updates.updated_at = new Date().toISOString();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

/** DELETE /api/users/:id — Delete a user profile */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const supabase = createServiceClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
