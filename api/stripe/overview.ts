export const config = { runtime: 'edge' };

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripeGet(path: string, apiKey: string) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe ${path}: ${res.status} — ${err}`);
  }
  return res.json();
}

export default async function handler(req: Request) {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Simple bearer auth to protect the endpoint
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('Authorization');
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get('token');
  const token = authHeader?.replace('Bearer ', '') || tokenParam;

  if (cronSecret && token !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [balance, customers, paymentIntents, accounts, transfers] = await Promise.all([
      stripeGet('/balance', apiKey),
      stripeGet('/customers?limit=100', apiKey),
      stripeGet('/payment_intents?limit=100', apiKey),
      stripeGet('/accounts?limit=100', apiKey),
      stripeGet('/transfers?limit=100', apiKey),
    ]);

    // Summarize payment intents by status
    const piByStatus: Record<string, { count: number; total: number }> = {};
    const piByType: Record<string, { count: number; total: number }> = {};
    for (const pi of paymentIntents.data) {
      const status = pi.status;
      if (!piByStatus[status]) piByStatus[status] = { count: 0, total: 0 };
      piByStatus[status].count++;
      piByStatus[status].total += pi.amount;

      const type = pi.metadata?.type || 'unknown';
      if (!piByType[type]) piByType[type] = { count: 0, total: 0 };
      piByType[type].count++;
      piByType[type].total += pi.amount;
    }

    const result = {
      account_id: balance.livemode ? 'live' : 'test',
      livemode: balance.livemode,
      balance: {
        available: balance.available,
        pending: balance.pending,
        connect_reserved: balance.connect_reserved,
      },
      customers: {
        count: customers.data.length,
        has_more: customers.has_more,
        list: customers.data.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          created: c.created,
          default_payment_method: c.invoice_settings?.default_payment_method,
          metadata: c.metadata,
        })),
      },
      payment_intents: {
        count: paymentIntents.data.length,
        has_more: paymentIntents.has_more,
        by_status: piByStatus,
        by_type: piByType,
        list: paymentIntents.data.map((pi: any) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          type: pi.metadata?.type || 'unknown',
          user_id: pi.metadata?.user_id,
          customer: pi.customer,
          payment_method_types: pi.payment_method_types,
          created: pi.created,
          latest_charge: pi.latest_charge,
        })),
      },
      connected_accounts: {
        count: accounts.data.length,
        has_more: accounts.has_more,
        list: accounts.data.map((a: any) => ({
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
        list: transfers.data.map((t: any) => ({
          id: t.id,
          amount: t.amount,
          currency: t.currency,
          destination: t.destination,
          created: t.created,
        })),
      },
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
