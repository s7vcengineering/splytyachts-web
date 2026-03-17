import { createServiceClient } from "@/lib/supabase";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { UsersFilter } from "./users-filter";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function getUsers(params: Record<string, string | undefined>) {
  const supabase = createServiceClient();

  let query = supabase
    .from("profiles")
    .select(
      "id, display_name, email, avatar_url, role, wallet_balance, stripe_customer_id, is_premium, premium_until, home_city, onboarding_complete, created_at",
      { count: "exact" },
    );

  if (params.q) {
    const q = params.q;
    // If it looks like a UUID prefix, search by ID too
    if (/^[0-9a-f-]{4,}$/i.test(q)) {
      query = query.or(
        `display_name.ilike.%${q}%,email.ilike.%${q}%,id.ilike.${q}%`,
      );
    } else {
      query = query.or(
        `display_name.ilike.%${q}%,email.ilike.%${q}%`,
      );
    }
  }

  if (params.role) {
    query = query.eq("role", params.role);
  }

  if (params.plan === "premium") {
    query = query.eq("is_premium", true);
  } else if (params.plan === "free") {
    query = query.or("is_premium.is.null,is_premium.eq.false");
  }

  query = query.order("created_at", { ascending: false }).limit(200);

  const { data, count } = await query;
  return { users: data ?? [], total: count ?? 0 };
}

export default async function CrewPage({ searchParams }: Props) {
  const params = await searchParams;
  const { users, total } = await getUsers(params);

  const premiumCount = users.filter(
    (u: Record<string, unknown>) => u.is_premium,
  ).length;
  const totalWallet = users.reduce(
    (sum: number, u: Record<string, unknown>) =>
      sum + (Number(u.wallet_balance) || 0),
    0,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Users</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
            {total} users
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
          <p className="text-xs text-ocean-400">Total Users</p>
          <p className="text-2xl font-bold text-white mt-1">{total}</p>
        </div>
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
          <p className="text-xs text-ocean-400">Premium Members</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">
            {premiumCount}
          </p>
        </div>
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
          <p className="text-xs text-ocean-400">Total Wallet Value</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {formatCurrency(totalWallet)}
          </p>
        </div>
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-4">
          <p className="text-xs text-ocean-400">With Stripe</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">
            {
              users.filter(
                (u: Record<string, unknown>) => u.stripe_customer_id,
              ).length
            }
          </p>
        </div>
      </div>

      <UsersFilter />

      <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ocean-800 text-ocean-300">
              <tr>
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">User ID</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">City</th>
                <th className="px-4 py-3 text-left font-medium">Wallet</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Stripe</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-800">
              {users.map((u: Record<string, unknown>) => (
                <tr
                  key={u.id as string}
                  className="hover:bg-ocean-800/50 transition-colors group"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/crew/${u.id}`}
                      className="flex items-center gap-3"
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url as string}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-xs font-bold">
                          {((u.display_name as string) ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-white font-medium group-hover:text-cyan-400 transition-colors">
                        {(u.display_name as string) ?? "Anonymous"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ocean-400 font-mono text-[11px]">
                    {(u.id as string).slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-ocean-300 text-xs">
                    {(u.email as string) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-xs font-medium capitalize",
                        (u.role as string) === "admin"
                          ? "bg-purple-500/20 text-purple-400"
                          : (u.role as string) === "host"
                            ? "bg-cyan-500/20 text-cyan-400"
                            : "bg-ocean-700 text-ocean-300",
                      )}
                    >
                      {(u.role as string) ?? "user"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ocean-300 text-xs">
                    {(u.home_city as string) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ocean-200 font-medium">
                    {formatCurrency((u.wallet_balance as number) ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_premium ? (
                      <div>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">
                          Premium
                        </span>
                        {u.premium_until ? (
                          <div className="text-[10px] text-ocean-500 mt-0.5">
                            until{" "}
                            {new Date(
                              u.premium_until as string,
                            ).toLocaleDateString()}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-ocean-500">Free</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.stripe_customer_id ? (
                      <span className="text-xs text-green-400 font-mono">
                        {(u.stripe_customer_id as string).slice(0, 14)}...
                      </span>
                    ) : (
                      <span className="text-xs text-ocean-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ocean-400 text-xs">
                    {new Date(u.created_at as string).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <div className="p-8 text-center text-ocean-400 text-sm">
            No users found
          </div>
        )}
      </div>
    </div>
  );
}
