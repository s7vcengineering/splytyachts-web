import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, statusColor, cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserActions } from "./user-actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUserData(id: string) {
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) return null;

  const [
    { data: experiences },
    { data: participations },
    { data: payments },
    { data: pledges },
    { data: bookings },
  ] = await Promise.all([
    supabase
      .from("experiences")
      .select(
        "id, title, status, total_cost, max_participants, current_participants, date_time, booking_status",
      )
      .eq("host_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("experience_participants")
      .select(
        "id, role, status, joined_at, experience:experience_id(id, title, status, date_time, total_cost)",
      )
      .eq("user_id", id)
      .order("joined_at", { ascending: false })
      .limit(20),
    supabase
      .from("payments")
      .select(
        "id, amount, status, stripe_payment_intent_id, experience_id, created_at",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("pledges")
      .select("id, amount, status, experience_id, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("bookings")
      .select(
        "id, status, booking_total_amount, booking_date, confirmation_number, experience_id, created_at",
      )
      .eq("experience_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    profile,
    experiences: experiences ?? [],
    participations: participations ?? [],
    payments: payments ?? [],
    pledges: pledges ?? [],
    bookings: bookings ?? [],
  };
}

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getUserData(id);

  if (!result) notFound();

  const { profile: p, experiences, participations, payments, pledges } = result;

  const totalPaid = payments
    .filter((pay: Record<string, unknown>) => pay.status === "succeeded")
    .reduce(
      (sum: number, pay: Record<string, unknown>) =>
        sum + Number(pay.amount ?? 0),
      0,
    );

  const totalPledged = pledges
    .filter(
      (pl: Record<string, unknown>) =>
        pl.status === "active" || pl.status === "fulfilled",
    )
    .reduce(
      (sum: number, pl: Record<string, unknown>) =>
        sum + Number(pl.amount ?? 0),
      0,
    );

  const premiumActive =
    p.is_premium && p.premium_until && new Date(p.premium_until) > new Date();
  const daysUntilRenewal = premiumActive
    ? Math.ceil(
        (new Date(p.premium_until).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ocean-400 mb-6">
        <Link
          href="/dashboard"
          className="hover:text-white transition-colors"
        >
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/crew" className="hover:text-white transition-colors">
          Users
        </Link>
        <span>/</span>
        <span className="text-ocean-300">
          {p.display_name ?? "Anonymous"}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-6 mb-8">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt=""
            className="w-20 h-20 rounded-full object-cover border-2 border-ocean-700"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-2xl font-bold">
            {(p.display_name ?? "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">
              {p.display_name ?? "Anonymous"}
            </h2>
            <span
              className={cn(
                "px-2 py-1 rounded-full text-xs font-medium capitalize",
                p.role === "admin"
                  ? "bg-purple-500/20 text-purple-400"
                  : p.role === "host"
                    ? "bg-cyan-500/20 text-cyan-400"
                    : "bg-ocean-700 text-ocean-300",
              )}
            >
              {p.role ?? "user"}
            </span>
            {premiumActive ? (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">
                Premium
              </span>
            ) : null}
          </div>
          <p className="text-sm text-ocean-400 mt-1 font-mono">{id}</p>
          {p.email ? (
            <p className="text-sm text-ocean-300 mt-1">{p.email}</p>
          ) : null}
          {p.home_city ? (
            <p className="text-xs text-ocean-500 mt-1">{p.home_city}</p>
          ) : null}
        </div>
      </div>

      {/* Admin Actions */}
      <div className="mb-6 bg-ocean-900 rounded-xl border border-ocean-700 p-4">
        <UserActions
          userId={id}
          currentRole={p.role ?? "user"}
          isPremium={!!premiumActive}
          walletBalance={Number(p.wallet_balance) || 0}
          displayName={p.display_name ?? "Anonymous"}
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Wallet Balance"
          value={formatCurrency(Number(p.wallet_balance) || 0)}
          valueClass="text-green-400"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(totalPaid)}
          valueClass="text-white"
        />
        <StatCard
          label="Total Pledged"
          value={formatCurrency(totalPledged)}
          valueClass="text-cyan-400"
        />
        <StatCard
          label="Experiences Hosted"
          value={String(experiences.length)}
          valueClass="text-white"
        />
        <StatCard
          label="Experiences Joined"
          value={String(participations.length)}
          valueClass="text-white"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Details */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Profile Details
            </h3>
          </div>
          <div className="p-6 space-y-3">
            <DetailRow label="User ID" value={id} valueClass="font-mono text-xs" />
            <DetailRow label="Email" value={p.email ?? "—"} />
            <DetailRow
              label="Display Name"
              value={p.display_name ?? "—"}
            />
            <DetailRow label="Home City" value={p.home_city ?? "—"} />
            <DetailRow label="Role" value={p.role ?? "user"} />
            <DetailRow
              label="Onboarding"
              value={p.onboarding_complete ? "Complete" : "Incomplete"}
              valueClass={
                p.onboarding_complete ? "text-green-400" : "text-yellow-400"
              }
            />
            <DetailRow
              label="Joined"
              value={new Date(p.created_at).toLocaleString()}
            />
            <DetailRow
              label="Last Updated"
              value={
                p.updated_at
                  ? new Date(p.updated_at).toLocaleString()
                  : "—"
              }
            />
            {p.bio ? (
              <div className="pt-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400 block mb-1">
                  Bio
                </span>
                <p className="text-sm text-ocean-200">{p.bio}</p>
              </div>
            ) : null}
            {p.interests && (p.interests as string[]).length > 0 ? (
              <div className="pt-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400 block mb-1">
                  Interests
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(p.interests as string[]).map((interest: string) => (
                    <span
                      key={interest}
                      className="px-2 py-0.5 rounded-full text-xs bg-ocean-800 text-ocean-300"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Financial & Subscription */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Financial & Subscription
            </h3>
          </div>
          <div className="p-6 space-y-3">
            <DetailRow
              label="Wallet Balance"
              value={formatCurrency(Number(p.wallet_balance) || 0)}
              valueClass="text-green-400 font-bold text-lg"
            />
            <DetailRow
              label="Budget Range"
              value={
                p.budget_min || p.budget_max
                  ? `${formatCurrency(p.budget_min ?? 0)} – ${formatCurrency(p.budget_max ?? 0)}`
                  : "Not set"
              }
            />

            <div className="border-t border-ocean-800 pt-3 mt-3">
              <span className="text-xs text-ocean-500 font-semibold uppercase tracking-wider">
                Subscription
              </span>
            </div>
            <DetailRow
              label="Plan"
              value={premiumActive ? "Premium" : "Free"}
              valueClass={premiumActive ? "text-cyan-400 font-bold" : ""}
            />
            {premiumActive ? (
              <>
                <DetailRow
                  label="Premium Until"
                  value={new Date(p.premium_until).toLocaleDateString()}
                  valueClass="text-cyan-400"
                />
                <DetailRow
                  label="Next Billing"
                  value={
                    daysUntilRenewal !== null
                      ? `${daysUntilRenewal} days (${new Date(p.premium_until).toLocaleDateString()})`
                      : "—"
                  }
                  valueClass={
                    daysUntilRenewal !== null && daysUntilRenewal <= 7
                      ? "text-yellow-400"
                      : "text-ocean-200"
                  }
                />
              </>
            ) : null}

            <div className="border-t border-ocean-800 pt-3 mt-3">
              <span className="text-xs text-ocean-500 font-semibold uppercase tracking-wider">
                Stripe
              </span>
            </div>
            <DetailRow
              label="Customer ID"
              value={p.stripe_customer_id ?? "Not connected"}
              valueClass={
                p.stripe_customer_id
                  ? "font-mono text-xs text-green-400"
                  : "text-ocean-500"
              }
            />
            {p.stripe_customer_id ? (
              <div className="flex items-center justify-between py-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400">
                  Stripe Dashboard
                </span>
                <a
                  href={`https://dashboard.stripe.com/customers/${p.stripe_customer_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View in Stripe &nearr;
                </a>
              </div>
            ) : null}

            <div className="border-t border-ocean-800 pt-3 mt-3">
              <span className="text-xs text-ocean-500 font-semibold uppercase tracking-wider">
                Referral
              </span>
            </div>
            <DetailRow
              label="Referral Code"
              value={p.referral_code ?? "—"}
              valueClass={p.referral_code ? "font-mono text-cyan-400" : ""}
            />
          </div>
        </div>

        {/* Social & Contact */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Contact & Social
            </h3>
          </div>
          <div className="p-6 space-y-3">
            <DetailRow label="Email" value={p.email ?? "—"} />
            <DetailRow
              label="FCM Token"
              value={
                p.fcm_token
                  ? `${String(p.fcm_token).slice(0, 20)}...`
                  : "No push token"
              }
              valueClass={
                p.fcm_token ? "font-mono text-xs text-green-400" : "text-ocean-500"
              }
            />
            {p.instagram_url ? (
              <div className="flex items-center justify-between py-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400">Instagram</span>
                <a
                  href={p.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {p.instagram_url} &nearr;
                </a>
              </div>
            ) : (
              <DetailRow label="Instagram" value="—" />
            )}
            {p.tiktok_url ? (
              <div className="flex items-center justify-between py-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400">TikTok</span>
                <a
                  href={p.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {p.tiktok_url} &nearr;
                </a>
              </div>
            ) : (
              <DetailRow label="TikTok" value="—" />
            )}
            {p.x_url ? (
              <div className="flex items-center justify-between py-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400">X / Twitter</span>
                <a
                  href={p.x_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {p.x_url} &nearr;
                </a>
              </div>
            ) : (
              <DetailRow label="X / Twitter" value="—" />
            )}

            {p.badges && (p.badges as string[]).length > 0 ? (
              <div className="pt-2 border-t border-ocean-800">
                <span className="text-xs text-ocean-400 block mb-1">
                  Badges
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(p.badges as string[]).map((badge: string) => (
                    <span
                      key={badge}
                      className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {p.boat_attestation ? (
              <DetailRow
                label="Boat Attestation"
                value={String(p.boat_attestation)}
                valueClass="text-xs"
              />
            ) : null}
          </div>
        </div>

        {/* Experiences Hosted */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Experiences Hosted ({experiences.length})
            </h3>
          </div>
          {experiences.length > 0 ? (
            <div className="divide-y divide-ocean-800">
              {experiences.map((e: Record<string, unknown>) => (
                <Link
                  key={e.id as string}
                  href={`/experiences/${e.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-ocean-800/50 transition-colors"
                >
                  <div>
                    <p className="text-sm text-white font-medium">
                      {e.title as string}
                    </p>
                    <p className="text-xs text-ocean-400">
                      {new Date(e.date_time as string).toLocaleDateString()} &middot;{" "}
                      {e.current_participants as number}/
                      {e.max_participants as number} crew
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium",
                        statusColor(e.status as string),
                      )}
                    >
                      {e.status as string}
                    </span>
                    <span className="text-ocean-200 text-sm font-medium">
                      {formatCurrency(e.total_cost as number)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-ocean-400 text-sm">
              No experiences hosted
            </div>
          )}
        </div>

        {/* Experiences Joined */}
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-ocean-700">
            <h3 className="text-lg font-semibold text-white">
              Experiences Joined ({participations.length})
            </h3>
          </div>
          {participations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">
                      Experience
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Role</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Exp Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Cost</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {participations.map((part: Record<string, unknown>) => {
                    const exp = part.experience as Record<
                      string,
                      unknown
                    > | null;
                    return (
                      <tr
                        key={part.id as string}
                        className="hover:bg-ocean-800/50"
                      >
                        <td className="px-4 py-3">
                          {exp ? (
                            <Link
                              href={`/experiences/${exp.id}`}
                              className="text-white hover:text-cyan-400 transition-colors font-medium"
                            >
                              {exp.title as string}
                            </Link>
                          ) : (
                            <span className="text-ocean-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ocean-300 capitalize text-xs">
                          {part.role as string}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              statusColor(part.status as string),
                            )}
                          >
                            {part.status as string}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {exp ? (
                            <span
                              className={cn(
                                "px-2 py-1 rounded-full text-xs font-medium",
                                statusColor(exp.status as string),
                              )}
                            >
                              {exp.status as string}
                            </span>
                          ) : (
                            <span className="text-ocean-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-ocean-200">
                          {exp
                            ? formatCurrency(exp.total_cost as number)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-ocean-400 text-xs">
                          {exp
                            ? new Date(
                                exp.date_time as string,
                              ).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-ocean-400 text-xs">
                          {part.joined_at
                            ? new Date(
                                part.joined_at as string,
                              ).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-ocean-400 text-sm">
              Not participating in any experiences
            </div>
          )}
        </div>

        {/* Payments */}
        {payments.length > 0 ? (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Payments ({payments.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">ID</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Stripe PI
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {payments.map((pay: Record<string, unknown>) => (
                    <tr
                      key={pay.id as string}
                      className="hover:bg-ocean-800/50"
                    >
                      <td className="px-4 py-3 text-ocean-300 font-mono text-xs">
                        {(pay.id as string).slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {formatCurrency(pay.amount as number)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            statusColor(pay.status as string),
                          )}
                        >
                          {pay.status as string}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ocean-400 font-mono text-xs truncate max-w-[200px]">
                        {(pay.stripe_payment_intent_id as string) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-ocean-400 text-xs">
                        {new Date(
                          pay.created_at as string,
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Pledges */}
        {pledges.length > 0 ? (
          <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden lg:col-span-2">
            <div className="px-6 py-4 border-b border-ocean-700">
              <h3 className="text-lg font-semibold text-white">
                Pledges ({pledges.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ocean-800 text-ocean-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">ID</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Experience
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-800">
                  {pledges.map((pl: Record<string, unknown>) => (
                    <tr
                      key={pl.id as string}
                      className="hover:bg-ocean-800/50"
                    >
                      <td className="px-4 py-3 text-ocean-300 font-mono text-xs">
                        {(pl.id as string).slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-cyan-400 font-medium">
                        {formatCurrency(pl.amount as number)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            statusColor(pl.status as string),
                          )}
                        >
                          {pl.status as string}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {pl.experience_id ? (
                          <Link
                            href={`/experiences/${pl.experience_id}`}
                            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-mono"
                          >
                            {(pl.experience_id as string).slice(0, 8)}...
                          </Link>
                        ) : (
                          <span className="text-ocean-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ocean-400 text-xs">
                        {new Date(
                          pl.created_at as string,
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
      <p className="text-xs text-ocean-400">{label}</p>
      <p className={cn("text-xl font-bold mt-1", valueClass ?? "text-white")}>
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
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-ocean-800 first:border-t-0">
      <span className="text-xs text-ocean-400">{label}</span>
      <span
        className={cn(
          "text-sm text-ocean-200 text-right max-w-[60%] truncate",
          valueClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}
