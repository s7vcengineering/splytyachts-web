"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserActionsProps {
  userId: string;
  currentRole: string;
  isPremium: boolean;
  walletBalance: number;
  displayName: string;
}

export function UserActions({
  userId,
  currentRole,
  isPremium,
  walletBalance,
  displayName,
}: UserActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletAmount, setWalletAmount] = useState("");
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(currentRole);

  async function updateUser(updates: Record<string, unknown>, action: string) {
    setLoading(action);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function deleteUser() {
    if (
      !confirm(
        `Are you sure you want to delete ${displayName}? This cannot be undone.`,
      )
    )
      return;
    if (!confirm("Final confirmation: DELETE this user permanently?")) return;

    setLoading("delete");
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      router.push("/crew");
    } finally {
      setLoading(null);
    }
  }

  const btnClass =
    "px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle Premium */}
      <button
        onClick={() =>
          updateUser(
            {
              is_premium: !isPremium,
              premium_until: !isPremium
                ? new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000,
                  ).toISOString()
                : null,
            },
            "premium",
          )
        }
        disabled={loading === "premium"}
        className={`${btnClass} ${
          isPremium
            ? "bg-ocean-800 text-ocean-300 hover:bg-ocean-700"
            : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
        }`}
      >
        {loading === "premium"
          ? "..."
          : isPremium
            ? "Revoke Premium"
            : "Grant Premium"}
      </button>

      {/* Change Role */}
      <button
        onClick={() => setShowRoleModal(true)}
        disabled={loading === "role"}
        className={`${btnClass} bg-purple-500/20 text-purple-400 hover:bg-purple-500/30`}
      >
        Change Role
      </button>

      {/* Adjust Wallet */}
      <button
        onClick={() => setShowWalletModal(true)}
        className={`${btnClass} bg-green-500/20 text-green-400 hover:bg-green-500/30`}
      >
        Adjust Wallet
      </button>

      {/* Delete User */}
      <button
        onClick={deleteUser}
        disabled={loading === "delete"}
        className={`${btnClass} bg-red-500/20 text-red-400 hover:bg-red-500/30 ml-auto`}
      >
        {loading === "delete" ? "Deleting..." : "Delete User"}
      </button>

      {/* Wallet Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 w-96 max-w-[90vw]">
            <h4 className="text-lg font-semibold text-white mb-4">
              Adjust Wallet Balance
            </h4>
            <p className="text-sm text-ocean-400 mb-3">
              Current balance:{" "}
              <span className="text-green-400 font-bold">
                ${walletBalance.toFixed(2)}
              </span>
            </p>
            <label className="text-xs text-ocean-400 block mb-1">
              New balance ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  setWalletAmount("");
                }}
                className="px-4 py-2 rounded-lg text-sm text-ocean-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const amount = parseFloat(walletAmount);
                  if (isNaN(amount) || amount < 0) {
                    alert("Enter a valid amount");
                    return;
                  }
                  await updateUser(
                    { wallet_balance: amount },
                    "wallet",
                  );
                  setShowWalletModal(false);
                  setWalletAmount("");
                }}
                disabled={loading === "wallet"}
                className="px-4 py-2 rounded-lg text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 font-medium transition-colors"
              >
                {loading === "wallet" ? "Saving..." : "Update Balance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-6 w-96 max-w-[90vw]">
            <h4 className="text-lg font-semibold text-white mb-4">
              Change User Role
            </h4>
            <p className="text-sm text-ocean-400 mb-3">
              Current role:{" "}
              <span className="text-purple-400 font-bold capitalize">
                {currentRole}
              </span>
            </p>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none mb-4"
            >
              <option value="user">User</option>
              <option value="host">Host</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRoleModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-ocean-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateUser({ role: selectedRole }, "role");
                  setShowRoleModal(false);
                }}
                disabled={loading === "role"}
                className="px-4 py-2 rounded-lg text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 font-medium transition-colors"
              >
                {loading === "role" ? "Saving..." : "Update Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
