import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { ExperiencesFilter } from "./experiences-filter";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getExperiences(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("experiences")
    .select(
      "id, title, status, total_cost, max_participants, current_participants, date_time, duration_hours, location, source_provider, booking_status, captain_id, host:host_id(display_name)",
      { count: "exact" },
    );

  // Status filter
  if (params.status) {
    if (params.status === "open") {
      query = query.in("status", ["open", "filling"]);
    } else {
      query = query.eq("status", params.status);
    }
  }

  // Captain filter
  if (params.captain === "needs_captain") {
    query = query.is("captain_id", null);
  } else if (params.captain === "has_captain") {
    query = query.not("captain_id", "is", null);
  }

  // Search
  if (params.q) {
    query = query.ilike("title", `%${params.q}%`);
  }

  query = query.order("created_at", { ascending: false }).limit(100);

  const { data: experiences, count } = await query;

  if (!experiences?.length) return { experiences: [], total: 0, payments: {}, invoices: {}, pledges: {} };

  const expIds = experiences.map((e) => e.id);

  const [{ data: payments }, { data: invoices }, { data: pledges }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("experience_id, amount, status, stripe_payment_intent_id")
        .in("experience_id", expIds),
      supabase
        .from("invoices")
        .select("experience_id, total_amount, status")
        .in("experience_id", expIds),
      supabase
        .from("pledges")
        .select("experience_id, amount, status")
        .in("experience_id", expIds),
    ]);

  const paymentsByExp: Record<string, { total: number; count: number; failed: number }> = {};
  for (const p of payments ?? []) {
    const eid = p.experience_id;
    if (!paymentsByExp[eid]) paymentsByExp[eid] = { total: 0, count: 0, failed: 0 };
    paymentsByExp[eid].count++;
    if (p.status === "succeeded") paymentsByExp[eid].total += Number(p.amount);
    if (p.status === "failed") paymentsByExp[eid].failed++;
  }

  const invoicesByExp: Record<string, { latest: string; count: number }> = {};
  for (const inv of invoices ?? []) {
    const eid = inv.experience_id;
    if (!invoicesByExp[eid]) invoicesByExp[eid] = { latest: inv.status, count: 0 };
    invoicesByExp[eid].count++;
    invoicesByExp[eid].latest = inv.status;
  }

  const pledgesByExp: Record<string, { active: number; total: number; amount: number }> = {};
  for (const pl of pledges ?? []) {
    const eid = pl.experience_id;
    if (!pledgesByExp[eid]) pledgesByExp[eid] = { active: 0, total: 0, amount: 0 };
    pledgesByExp[eid].total++;
    if (pl.status === "active" || pl.status === "fulfilled") {
      pledgesByExp[eid].active++;
      pledgesByExp[eid].amount += Number(pl.amount);
    }
  }

  const enriched = experiences.map((e) => ({
    ...e,
    _payments: paymentsByExp[e.id] ?? null,
    _invoices: invoicesByExp[e.id] ?? null,
    _pledges: pledgesByExp[e.id] ?? null,
  }));

  return { experiences: enriched, total: count ?? 0, payments: paymentsByExp, invoices: invoicesByExp, pledges: pledgesByExp };
}

export default async function ExperiencesPage({ searchParams }: Props) {
  const params = await searchParams;
  const { experiences, total } = await getExperiences(params);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Experiences</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
            {total} experiences
          </span>
        </div>
        {(params.status || params.captain || params.q) && (
          <Link
            href="/experiences"
            className="text-xs text-ocean-400 hover:text-white transition-colors underline"
          >
            Show all
          </Link>
        )}
      </div>

      <ExperiencesFilter />

      <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Host</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Booking</th>
                <th className="px-4 py-3 text-left font-medium">Captain</th>
                <th className="px-4 py-3 text-left font-medium">Cost</th>
                <th className="px-4 py-3 text-left font-medium">Crew</th>
                <th className="px-4 py-3 text-left font-medium">Payments</th>
                <th className="px-4 py-3 text-left font-medium">Invoice</th>
                <th className="px-4 py-3 text-left font-medium">Pledges</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {experiences.map((e) => (
                <tr
                  key={e.id as string}
                  className="hover:bg-ocean-800/50 transition-colors group"
                >
                  <td className="px-4 py-3 max-w-[200px]">
                    <Link
                      href={`/experiences/${e.id}`}
                      className="text-white font-medium hover:text-cyan-400 transition-colors truncate block"
                    >
                      {e.title as string}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ocean-300">
                    {String((e.host as unknown as Record<string, unknown>)?.display_name ?? "—")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium",
                        statusColor(e.status as string),
                      )}
                    >
                      {e.status as string}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.booking_status ? (
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          statusColor(e.booking_status as string),
                        )}
                      >
                        {(e.booking_status as string).replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-ocean-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.captain_id ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                        Assigned
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
                        Needs Captain
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ocean-200">
                    {formatCurrency(e.total_cost as number)}
                  </td>
                  <td className="px-4 py-3 text-ocean-300">
                    {e.current_participants as number}/
                    {e.max_participants as number}
                  </td>
                  <td className="px-4 py-3">
                    {e._payments ? (
                      <div className="space-y-0.5">
                        <span className="text-green-400 text-xs font-medium">
                          {formatCurrency(e._payments.total)}
                        </span>
                        <div className="text-ocean-500 text-[10px]">
                          {e._payments.count} payment
                          {e._payments.count !== 1 ? "s" : ""}
                          {e._payments.failed > 0 && (
                            <span className="text-red-400 ml-1">
                              ({e._payments.failed} failed)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-ocean-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e._invoices ? (
                      <div className="space-y-0.5">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium",
                            statusColor(e._invoices.latest),
                          )}
                        >
                          {e._invoices.latest}
                        </span>
                        {e._invoices.count > 1 && (
                          <div className="text-ocean-500 text-[10px]">
                            {e._invoices.count} invoices
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-ocean-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e._pledges ? (
                      <div className="space-y-0.5">
                        <span className="text-cyan-400 text-xs font-medium">
                          {e._pledges.active}/{e._pledges.total}
                        </span>
                        {e._pledges.amount > 0 && (
                          <div className="text-ocean-500 text-[10px]">
                            {formatCurrency(e._pledges.amount)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-ocean-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ocean-400 text-xs">
                    {new Date(e.date_time as string).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-ocean-400 capitalize text-xs">
                    {(e.source_provider as string) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
