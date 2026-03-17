import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeGet(path: string, apiKey: string) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function shortDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncId(id: string | null) {
  if (!id) return "—";
  return id.length > 24 ? id.slice(0, 24) + "…" : id;
}

const statusColors: Record<string, string> = {
  succeeded: "bg-green-500/20 text-green-400",
  requires_payment_method: "bg-yellow-500/20 text-yellow-400",
  requires_confirmation: "bg-yellow-500/20 text-yellow-400",
  requires_action: "bg-yellow-500/20 text-yellow-400",
  processing: "bg-blue-500/20 text-blue-400",
  canceled: "bg-red-500/20 text-red-400",
};

const typeColors: Record<string, string> = {
  deposit: "bg-blue-500/20 text-blue-400",
  premium: "bg-purple-500/20 text-purple-400",
  pledge: "bg-cyan-500/20 text-cyan-400",
  unknown: "bg-gray-500/20 text-gray-400",
};

export default async function StripePage() {
  const apiKey =
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_PROD;

  if (!apiKey) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Stripe</h2>
        <div className="bg-ocean-900 rounded-xl border border-red-500/30 p-8 text-center">
          <p className="text-red-400 font-medium">
            STRIPE_SECRET_KEY not configured
          </p>
          <p className="text-ocean-400 text-sm mt-2">
            Add STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_PROD to your environment
            variables.
          </p>
        </div>
      </div>
    );
  }

  const [balance, customers, paymentIntents, accounts, transfers] =
    await Promise.all([
      stripeGet("/balance", apiKey),
      stripeGet("/customers?limit=100", apiKey),
      stripeGet("/payment_intents?limit=100", apiKey),
      stripeGet("/accounts?limit=100", apiKey),
      stripeGet("/transfers?limit=100", apiKey),
    ]);

  if (!balance || !customers || !paymentIntents) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Stripe</h2>
        <div className="bg-ocean-900 rounded-xl border border-red-500/30 p-8 text-center">
          <p className="text-red-400 font-medium">
            Failed to fetch Stripe data
          </p>
          <p className="text-ocean-400 text-sm mt-2">
            Check that your Stripe API key is valid.
          </p>
        </div>
      </div>
    );
  }

  const avail = balance.available.reduce(
    (s: number, b: { amount: number }) => s + b.amount,
    0,
  );
  const pending = balance.pending.reduce(
    (s: number, b: { amount: number }) => s + b.amount,
    0,
  );
  const connectReserved = (balance.connect_reserved || []).reduce(
    (s: number, b: { amount: number }) => s + b.amount,
    0,
  );

  // Aggregate payment intents
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

  const succeeded = piByStatus.succeeded || { count: 0, total: 0 };

  // Customer lookup
  const custMap: Record<string, { name: string | null }> = {};
  for (const c of customers.data) {
    custMap[c.id] = { name: c.name };
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-white">Stripe</h2>
        <span
          className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
            balance.livemode
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400",
          )}
        >
          {balance.livemode ? "Live" : "Test Mode"}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Available Balance"
          value={fmt(avail)}
          sub="Ready for payout"
          color="text-green-400"
        />
        <SummaryCard
          label="Pending Balance"
          value={fmt(pending)}
          sub="Processing"
          color="text-yellow-400"
        />
        <SummaryCard
          label="Total Collected"
          value={fmt(succeeded.total)}
          sub={`${succeeded.count} successful payments`}
          color="text-cyan-400"
        />
        <SummaryCard
          label="Connect Reserved"
          value={fmt(connectReserved)}
          sub={`${accounts?.data.length ?? 0} connected accounts`}
          color="text-ocean-300"
        />
      </div>

      {/* Payment breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {Object.entries(piByType).map(([type, info]) => (
          <div
            key={type}
            className="bg-ocean-900 rounded-lg border border-ocean-700 p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ocean-500 mb-1">
              {type}
            </p>
            <p className="text-lg font-bold text-white">{fmt(info.total)}</p>
            <p className="text-xs text-ocean-400">{info.count} payments</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Object.entries(piByStatus).map(([status, info]) => (
          <div
            key={status}
            className="bg-ocean-900 rounded-lg border border-ocean-700 p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ocean-500 mb-1">
              {status.replace(/_/g, " ")}
            </p>
            <p className="text-lg font-bold text-white">{fmt(info.total)}</p>
            <p className="text-xs text-ocean-400">{info.count} payments</p>
          </div>
        ))}
      </div>

      {/* Customers */}
      <Section
        title="Customers"
        count={`${customers.data.length} customers`}
      >
        <table className="w-full text-sm">
          <thead className="bg-ocean-800 text-ocean-300">
            <tr>
              <th className="px-6 py-3 text-left font-medium">Customer ID</th>
              <th className="px-6 py-3 text-left font-medium">Name</th>
              <th className="px-6 py-3 text-left font-medium">
                Supabase User
              </th>
              <th className="px-6 py-3 text-left font-medium">
                Payment Method
              </th>
              <th className="px-6 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ocean-800">
            {customers.data.map(
              (c: Record<string, unknown>) => {
                const meta = c.metadata as Record<string, string> | null;
                const userId = meta?.supabase_user_id || "—";
                const shortUser =
                  userId.length > 12 ? userId.slice(0, 8) + "…" : userId;
                const invoiceSettings = c.invoice_settings as Record<
                  string,
                  unknown
                > | null;
                const pm = invoiceSettings?.default_payment_method as
                  | string
                  | null;
                return (
                  <tr
                    key={c.id as string}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-mono text-xs text-ocean-400">
                      {truncId(c.id as string)}
                    </td>
                    <td className="px-6 py-3 text-white">
                      {(c.name as string) || (
                        <span className="text-ocean-500">unnamed</span>
                      )}
                    </td>
                    <td
                      className="px-6 py-3 font-mono text-xs text-ocean-400"
                      title={userId}
                    >
                      {shortUser}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-ocean-400">
                      {pm ? truncId(pm) : "—"}
                    </td>
                    <td className="px-6 py-3 text-ocean-400 text-xs">
                      {shortDate(c.created as number)}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </Section>

      {/* Payment Intents */}
      <Section
        title="Payment Intents"
        count={`${paymentIntents.data.length} payments`}
      >
        <table className="w-full text-sm">
          <thead className="bg-ocean-800 text-ocean-300">
            <tr>
              <th className="px-6 py-3 text-left font-medium">ID</th>
              <th className="px-6 py-3 text-left font-medium">Amount</th>
              <th className="px-6 py-3 text-left font-medium">Type</th>
              <th className="px-6 py-3 text-left font-medium">Status</th>
              <th className="px-6 py-3 text-left font-medium">Customer</th>
              <th className="px-6 py-3 text-left font-medium">Methods</th>
              <th className="px-6 py-3 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ocean-800">
            {paymentIntents.data.map(
              (pi: Record<string, unknown>) => {
                const meta = pi.metadata as Record<string, string> | null;
                const type = meta?.type || "unknown";
                const status = pi.status as string;
                const custId = pi.customer as string;
                const cust = custMap[custId];
                const custLabel = cust?.name || truncId(custId);
                const methods = (
                  (pi.payment_method_types as string[]) || []
                ).slice(0, 3);
                const extra =
                  ((pi.payment_method_types as string[]) || []).length - 3;
                return (
                  <tr
                    key={pi.id as string}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-mono text-xs text-ocean-400">
                      {truncId(pi.id as string)}
                    </td>
                    <td className="px-6 py-3 text-cyan-400 font-semibold">
                      {fmt(pi.amount as number)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          typeColors[type] || typeColors.unknown,
                        )}
                      >
                        {type}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          statusColors[status] || "bg-gray-500/20 text-gray-400",
                        )}
                      >
                        {status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-ocean-300 text-xs">
                      {custLabel}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {methods.map((m) => (
                          <span
                            key={m}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-ocean-800 text-ocean-400 uppercase"
                          >
                            {m}
                          </span>
                        ))}
                        {extra > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-ocean-800 text-ocean-400">
                            +{extra}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-ocean-400 text-xs">
                      {shortDate(pi.created as number)}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </Section>

      {/* Connected Accounts */}
      <Section
        title="Connected Accounts (Stripe Connect)"
        count={`${accounts?.data.length ?? 0} accounts`}
      >
        {accounts?.data.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-ocean-400 font-medium">
              No connected accounts yet
            </p>
            <p className="text-ocean-500 text-sm mt-1">
              Stripe Connect onboarding has not been set up. Required for
              people-as-wallets and captain payouts.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-6 py-3 text-left font-medium">
                  Account ID
                </th>
                <th className="px-6 py-3 text-left font-medium">Type</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                <th className="px-6 py-3 text-left font-medium">Charges</th>
                <th className="px-6 py-3 text-left font-medium">Payouts</th>
                <th className="px-6 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {accounts.data.map(
                (a: Record<string, unknown>) => (
                  <tr
                    key={a.id as string}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-mono text-xs text-ocean-400">
                      {truncId(a.id as string)}
                    </td>
                    <td className="px-6 py-3 text-ocean-300">
                      {a.type as string}
                    </td>
                    <td className="px-6 py-3 text-ocean-300">
                      {(a.email as string) || "—"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          a.charges_enabled
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400",
                        )}
                      >
                        {a.charges_enabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          a.payouts_enabled
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400",
                        )}
                      >
                        {a.payouts_enabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-ocean-400 text-xs">
                      {shortDate(a.created as number)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </Section>

      {/* Transfers */}
      <Section
        title="Transfers"
        count={`${transfers?.data.length ?? 0} transfers`}
      >
        {transfers?.data.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-ocean-400 font-medium">No transfers yet</p>
            <p className="text-ocean-500 text-sm mt-1">
              Transfers move funds to connected accounts (captain payouts, user
              wallets). Requires Stripe Connect first.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-6 py-3 text-left font-medium">
                  Transfer ID
                </th>
                <th className="px-6 py-3 text-left font-medium">Amount</th>
                <th className="px-6 py-3 text-left font-medium">
                  Destination
                </th>
                <th className="px-6 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {transfers.data.map(
                (t: Record<string, unknown>) => (
                  <tr
                    key={t.id as string}
                    className="hover:bg-ocean-800/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-mono text-xs text-ocean-400">
                      {truncId(t.id as string)}
                    </td>
                    <td className="px-6 py-3 text-cyan-400 font-semibold">
                      {fmt(t.amount as number)}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-ocean-400">
                      {truncId(t.destination as string)}
                    </td>
                    <td className="px-6 py-3 text-ocean-400 text-xs">
                      {shortDate(t.created as number)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-5">
      <p className="text-xs text-ocean-400 font-medium uppercase tracking-wider">
        {label}
      </p>
      <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
      <p className="text-[10px] text-ocean-500 mt-1">{sub}</p>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-ocean-700 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <span className="text-xs text-ocean-400 bg-ocean-800 px-2.5 py-1 rounded-full">
          {count}
        </span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
