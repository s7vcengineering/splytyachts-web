import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function generateOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

export async function POST(request: NextRequest) {
  let email: string;
  try {
    const body = await request.json();
    email = body.email?.trim()?.toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  // Delete any existing OTPs for this email before inserting
  await supabase.from("email_otps").delete().eq("email", email);

  const { error: insertError } = await supabase.from("email_otps").insert({
    email,
    code,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("Failed to store OTP:", insertError.message);
    return NextResponse.json(
      { error: "Failed to generate verification code" },
      { status: 500 },
    );
  }

  // Send email via Resend
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SPLYT <verify@splyt.app>",
        to: [email],
        subject: `${code} is your SPLYT verification code`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a2e; margin-bottom: 8px;">Verify your email</h2>
            <p style="color: #666; font-size: 15px; line-height: 1.5;">
              Enter this code in the SPLYT app to verify your email address:
            </p>
            <div style="background: #f0f4ff; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a1a2e;">${code}</span>
            </div>
            <p style="color: #999; font-size: 13px;">
              This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend API error:", errText);
      return NextResponse.json(
        { error: "Failed to send verification email" },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
