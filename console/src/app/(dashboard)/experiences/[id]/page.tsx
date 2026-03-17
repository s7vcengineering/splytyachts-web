import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaptainAssign } from "./captain-assign";
import { TriggerBooking } from "./trigger-booking";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getExperience(id: string) {
  const supabase = createServiceClient();

  const { data: experience } = await supabase
    .from("experiences")
    .select("*, host:host_id(id, display_name, avatar_url)")
    .eq("id", id)
    .single();

  if (!experience) return null;

  // Fetch captain data if assigned
  let captain = null;
  if (experience.captain_id) {
    const { data: captainData } = await supabase
      .from("captains")
      .select("id, name, avatar_url, rating, boats_count, source")
      .eq("id", experience.captain_id)
      .single();
    captain = captainData;
  }

  // Try to find the linked boat (by matching source_url or boat name)
  let boat = null;
  if (experience.boat_name) {
    const { data: boatData } = await supabase
      .from("boats")
      .select("id, name")
      .ilike("name", experience.boat_name)
      .limit(1)
      .maybeSingle();
    boat = boatData;
  }

  // Fetch related data in parallel
  const [
    { data: participants },
    { data: bookings },
    { data: payments },
    { data: invoices },
    { data: pledges },
  ] = await Promise.all([
    supabase
      .from("experience_participants")
      .select("*, profile:user_id(display_name, avatar_url)")
      .eq("experience_id", id)
      .order("joined_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, status, source_provider, booking_date, booking_total_amount, confirmation_number, failure_reason, created_at")
      .eq("experience_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, status, stripe_payment_intent_id, created_at, user:user_id(display_name)")
      .eq("experience_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, total_amount, status, stripe_invoice_id, created_at")
      .eq("experience_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("pledges")
      .select("id, amount, status, created_at, user:user_id(display_name)")
      .eq("experience_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    experience,
    captain,
    boat,
    participants: participants ?? [],
    bookings: bookings ?? [],
    payments: payments ?? [],
    invoices: invoices ?? [],
    pledges: pledges ?? [],
  };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getExperience(id);

  if (!result) notFound();

  const { experience: e, captain, boat, participants, bookings, payments, invoices, pledges } = result;
  const host = e.host as Record<string, unknown> | null;

  const totalPaid = payments
    .filter((p: Record<string, unknown>) => p.status === "succeeded")
    .reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount), 0);

  const totalPledged = pledges
    .filter((p: Record<string, unknown>) => p.status === "active" || p.status === "fulfilled")
    .reduce((sum: number, p: Record<string, unknown>) => sum + Number(p.amount), 0);

  const hasActiveBooking = bookings.some(
    (b: Record<string, unknown>) =>
      ["pending", "in_progress", "booked", "confirmed"].includes(b.status as string),
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ocean-400 mb-6">
        <Link href="/dashboard" className="hover:text-white transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/experiences" className="hover:text-white transition-colors">
          Experiences
        </Link>
        <span>/</span>
        <span className="text-ocean-300 truncate max-w-[200px]">{e.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{e.title}</h2>
          <p className="text-sm text-ocean-400 mt-1">
            Hosted by {(host?.display_name as string) ?? "Unknown"}
            {e.location ? ` &middot; ${e.location}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TriggerBooking
            experienceId={e.id}
            hasSourceUrl={!!e.source_url}
            hasActiveBooking={hasActiveBooking}
          />
          <span
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium",
              statusColor(e.status),
            )}
          >
            {e.status}
          </span>
          {e.booking_status ? (
            <span
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium",
                statusColor(e.booking_status),
              )}
            >
              {e.booking_status.replace("_", " ")}
            </span>
          ) : null}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Cost" value={formatCurrency(e.total_cost ?? 0)} />
        <StatCard
          label="Crew"
          value={`${e.current_participants ?? 0} / ${e.max_participants ?? 0}`}
        />
        <StatCard
          label="Paid"
          value={formatCurrency(totalPaid)}
          accent={totalPaid > 0}
        />
        <StatCard
          label="Pledged"
          value={formatCurrency(totalPledged)}
          accent={totalPledged > 0}
        />
        <StatCard
          label="Date"
          value={e.date_time ? new Date(e.date_time).toLocaleDateString() : "TBD"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Experience Details */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">Details</h3>
          </div>
          <div className="p-6 space-y-3">
            <DetailRow label="ID" value={e.id} valueClass="font-mono text-xs" />
            <DetailRow label="Status" value={e.status} />
            <DetailRow label="Booking Status" value={e.booking_status ?? "—"} />
            <DetailRow label="Duration" value={`${e.duration_hours ?? 0} hours`} />
            <DetailRow label="Location" value={e.location ?? "—"} />
            <DetailRow label="Source" value={e.source_provider ?? "manual"} />
            {e.source_url && (
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-ocean-400">Source URL</span>
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors truncate max-w-[250px]"
                >
                  View on {e.source_provider ?? "source"} &rarr;
                </a>
              </div>
            )}
            {e.boat_name && (
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-ocean-400">Boat</span>
                {boat ? (
                  <Link
                    href={`/boats/${boat.id}`}
                    className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    {e.boat_name} &rarr;
                  </Link>
                ) : (
                  <span className="text-sm text-ocean-200">{e.boat_name}</span>
                )}
              </div>
            )}
            {e.boat_type && <DetailRow label="Boat Type" value={e.boat_type} />}
            {e.boat_capacity && <DetailRow label="Boat Capacity" value={e.boat_capacity} />}
            <DetailRow label="Created" value={new Date(e.created_at).toLocaleString()} />
            {e.description ? (
              <div className="pt-3 border-t border-ocean-800">
                <p className="text-xs text-ocean-400 mb-1">Description</p>
                <p className="text-sm text-ocean-200">{e.description}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Participants */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Crew ({participants.length})
            </h3>
          </div>
          {participants.length > 0 ? (
            <div className="divide-y divide-ocean-800">
              {participants.map((p: Record<string, unknown>) => {
                const profile = p.profile as Record<string, unknown> | null;
                return (
                  <div
                    key={p.id as string}
                    className="px-6 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url as string}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-xs font-bold">
                          {((profile?.display_name as string) ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="text-sm text-white font-medium">
                          {(profile?.display_name as string) ?? "Unknown"}
                        </span>
                        <p className="text-[10px] text-ocean-500">
                          {p.role as string} &middot; Joined{" "}
                          {new Date(p.joined_at as string).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium",
                        statusColor(p.status as string),
                      )}
                    >
                      {p.status as string}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-ocean-400 text-sm">
              No participants yet
            </div>
          )}
        </div>

        {/* Captain Assignment */}
        <CaptainAssign
          experienceId={e.id}
          currentCaptain={captain}
        />

        {/* Bookings */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Bookings ({bookings.length})
            </h3>
          </div>
          {bookings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">ID</th>
                    <th className="px-6 py-3 text-left font-medium">Provider</th>
                    <th className="px-6 py-3 text-left font-medium">Date</th>
                    <th className="px-6 py-3 text-left font-medium">Amount</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Confirmation</th>
                    <th className="px-6 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {bookings.map((b: Record<string, unknown>) => (
                    <tr key={b.id as string} className="hover:bg-ocean-800/50">
                      <td className="px-6 py-3 text-ocean-300 font-mono text-xs">
                        {(b.id as string).slice(0, 8)}
                      </td>
                      <td className="px-6 py-3 text-ocean-300 capitalize">
                        {b.source_provider as string}
                      </td>
                      <td className="px-6 py-3 text-ocean-300">
                        {b.booking_date as string}
                      </td>
                      <td className="px-6 py-3 text-white font-medium">
                        {formatCurrency(b.booking_total_amount as number)}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            statusColor(b.status as string),
                          )}
                        >
                          {(b.status as string).replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-green-400 font-mono text-xs">
                        {b.confirmation_number ? `#${b.confirmation_number}` : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <Link
                          href={`/bookings/${b.id}`}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          Detail &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-ocean-400 text-sm">
              No bookings for this experience
            </div>
          )}
        </div>

        {/* Payments */}
        {payments.length > 0 ? (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Payments ({payments.length})
              </h3>
            </div>
            <div className="divide-y divide-ocean-800">
              {payments.map((p: Record<string, unknown>) => {
                const user = p.user as Record<string, unknown> | null;
                return (
                  <div key={p.id as string} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-white font-medium">
                        {formatCurrency(p.amount as number)}
                      </span>
                      <p className="text-[10px] text-ocean-500">
                        {(user?.display_name as string) ?? "Unknown"} &middot;{" "}
                        {new Date(p.created_at as string).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColor(p.status as string))}>
                        {p.status as string}
                      </span>
                      {p.stripe_payment_intent_id ? (
                        <span className="text-[10px] text-ocean-500 font-mono">
                          {(p.stripe_payment_intent_id as string).slice(0, 15)}...
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Pledges */}
        {pledges.length > 0 ? (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Pledges ({pledges.length})
              </h3>
            </div>
            <div className="divide-y divide-ocean-800">
              {pledges.map((p: Record<string, unknown>) => {
                const user = p.user as Record<string, unknown> | null;
                return (
                  <div key={p.id as string} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-cyan-400 font-medium">
                        {formatCurrency(p.amount as number)}
                      </span>
                      <p className="text-[10px] text-ocean-500">
                        {(user?.display_name as string) ?? "Unknown"} &middot;{" "}
                        {new Date(p.created_at as string).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColor(p.status as string))}>
                      {p.status as string}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Invoices */}
        {invoices.length > 0 ? (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Invoices ({invoices.length})
              </h3>
            </div>
            <div className="divide-y divide-ocean-800">
              {invoices.map((inv: Record<string, unknown>) => (
                <div key={inv.id as string} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-white font-medium">
                      {formatCurrency(inv.total_amount as number)}
                    </span>
                    <p className="text-[10px] text-ocean-500 font-mono">
                      {inv.stripe_invoice_id ? String(inv.stripe_invoice_id) : (inv.id as string).slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusColor(inv.status as string))}>
                      {inv.status as string}
                    </span>
                    <span className="text-xs text-ocean-500">
                      {new Date(inv.created_at as string).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
      <p className="text-[10px] text-ocean-400 font-medium uppercase tracking-wider">
        {label}
      </p>
      <p className={cn("text-lg font-bold mt-1", accent ? "text-cyan-400" : "text-white")}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-ocean-400">{label}</span>
      <span className={cn("text-sm text-ocean-200", valueClass)}>{value}</span>
    </div>
  );
}
