import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let email: string;
  let code: string;
  try {
    const body = await request.json();
    email = body.email?.trim()?.toLowerCase();
    code = body.code?.trim();
    if (!email || !code) {
      return NextResponse.json({ error: "Missing email or code" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Look up the most recent OTP for this email
  const { data: otp, error: fetchError } = await supabase
    .from("email_otps")
    .select()
    .eq("email", email)
    .eq("verified", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("OTP lookup error:", fetchError.message);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }

  if (!otp) {
    return NextResponse.json(
      { error: "No verification code found. Please request a new one." },
      { status: 400 },
    );
  }

  // Check expiry
  if (new Date(otp.expires_at) < new Date()) {
    await supabase.from("email_otps").delete().eq("id", otp.id);
    return NextResponse.json(
      { error: "Verification code has expired. Please request a new one." },
      { status: 400 },
    );
  }

  // Check code
  if (otp.code !== code) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  // Clean up all OTPs for this email
  await supabase.from("email_otps").delete().eq("email", email);

  return NextResponse.json({ success: true, verified: true });
}
