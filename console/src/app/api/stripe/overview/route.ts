import { NextResponse } from "next/server";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeGet(path: string, apiKey: string) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe ${path}: ${res.status} — ${err}`);
  }
  return res.json();
}

export async function GET() {
  const apiKey =
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_PROD;
  if (!apiKey) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const [balance, customers, paymentIntents, accounts, transfers] =
      await Promise.all([
        stripeGet("/balance", apiKey),
        stripeGet("/customers?limit=100", apiKey),
        stripeGet("/payment_intents?limit=100", apiKey),
        stripeGet("/accounts?limit=100", apiKey),
        stripeGet("/transfers?limit=100", apiKey),
      ]);

    const piByStatus: Record<string, { count: number; total: number }> = {};
    const piByType: Record<string, { count: number; total: number }> = {};
    for (const pi of paymentIntents.data) {
      const status = pi.status;
      if (!piByStatus[status]) piByStatus[status] = { count: 0, total: 0 };
      piByStatus[status].count++;
      piByStatus[status].total += pi.amount;

      const type = pi.metadata?.type || "unknown";
      if (!piByType[type]) piByType[type] = { count: 0, total: 0 };
      piByType[type].count++;
      piByType[type].total += pi.amount;
    }

    return NextResponse.json({
      livemode: balance.livemode,
      balance: {
        available: balance.available,
        pending: balance.pending,
        connect_reserved: balance.connect_reserved,
      },
      customers: {
        count: customers.data.length,
        has_more: customers.has_more,
        list: customers.data.map((c: Record<string, unknown>) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          created: c.created,
          default_payment_method: (
            c.invoice_settings as Record<string, unknown>
          )?.default_payment_method,
          metadata: c.metadata,
        })),
      },
      payment_intents: {
        count: paymentIntents.data.length,
        has_more: paymentIntents.has_more,
        by_status: piByStatus,
        by_type: piByType,
        list: paymentIntents.data.map((pi: Record<string, unknown>) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          type: (pi.metadata as Record<string, unknown>)?.type || "unknown",
          user_id: (pi.metadata as Record<string, unknown>)?.user_id,
          customer: pi.customer,
          payment_method_types: pi.payment_method_types,
          created: pi.created,
        })),
      },
      connected_accounts: {
        count: accounts.data.length,
        has_more: accounts.has_more,
        list: accounts.data.map((a: Record<string, unknown>) => ({
          id: a.id,
          type: a.type,
          email: a.email,
          charges_enabled: a.charges_enabled,
          payouts_enabled: a.payouts_enabled,
          created: a.created,
        })),
      },
      transfers: {
        count: transfers.data.length,
        has_more: transfers.has_more,
        list: transfers.data.map((t: Record<string, unknown>) => ({
          id: t.id,
          amount: t.amount,
          currency: t.currency,
          destination: t.destination,
          created: t.created,
        })),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
