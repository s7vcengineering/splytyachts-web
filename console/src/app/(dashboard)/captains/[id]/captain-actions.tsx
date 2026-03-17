"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface CaptainActionsProps {
  captainId: string;
  profileId: string | null;
  captainPhone: string | null;
}

export function CaptainActions({ captainId, profileId, captainPhone }: CaptainActionsProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Outreach state
  const [outreachTitle, setOutreachTitle] = useState("");
  const [outreachDate, setOutreachDate] = useState("");
  const [outreachMessages, setOutreachMessages] = useState<Record<string, string> | null>(null);
  const [generatingOutreach, setGeneratingOutreach] = useState(false);
  const [copiedLang, setCopiedLang] = useState<string | null>(null);

  async function handleSaveContact() {
    if (!phone && !email) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/captains/${captainId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(phone && { phone }),
          ...(email && { email }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
        return;
      }

      setMessage("Contact info saved");
      setPhone("");
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateProfile() {
    setCreating(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/captains/${captainId}/create-profile`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Profile creation failed");
        return;
      }

      setMessage("Shadow profile created");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopyPhone() {
    if (!captainPhone) return;
    await navigator.clipboard.writeText(captainPhone);
    setMessage("Phone copied!");
    setTimeout(() => setMessage(null), 2000);
  }

  async function handleGenerateOutreach() {
    setGeneratingOutreach(true);
    setError(null);
    setOutreachMessages(null);

    try {
      const res = await fetch(`/api/captains/${captainId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experience_title: outreachTitle || undefined,
          experience_date: outreachDate || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Outreach generation failed");
        return;
      }

      const data = await res.json();
      setOutreachMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setGeneratingOutreach(false);
    }
  }

  async function handleCopyMessage(lang: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedLang(lang);
    setTimeout(() => setCopiedLang(null), 2000);
  }

  const inputClass =
    "w-full rounded-lg border border-ocean-700 bg-ocean-800 px-3 py-2 text-sm text-white placeholder-ocean-500 focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500 focus:outline-none";

  const langLabels: Record<string, string> = { en: "English", es: "Spanish", pt: "Portuguese" };

  return (
    <div className="bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-ocean-700">
        <h3 className="text-lg font-semibold text-white">Admin Actions</h3>
      </div>
      <div className="p-6 space-y-5">
        {/* Quick copy phone */}
        {captainPhone && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ocean-300">Phone:</span>
            <span className="text-sm text-white font-mono">{captainPhone}</span>
            <button
              onClick={handleCopyPhone}
              className="px-2 py-1 rounded text-xs font-medium bg-ocean-800 text-ocean-300 hover:bg-ocean-700 hover:text-white transition-colors"
              title="Copy phone number"
            >
              Copy
            </button>
          </div>
        )}

        {/* Edit contact info */}
        <div>
          <p className="text-sm text-ocean-300 font-medium mb-3">Contact Info</p>
          <div className="space-y-2">
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <button
              onClick={handleSaveContact}
              disabled={saving || (!phone && !email)}
              className={cn(
                "w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                saving || (!phone && !email)
                  ? "bg-ocean-800 text-ocean-500 cursor-not-allowed"
                  : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30",
              )}
            >
              {saving ? "Saving..." : "Save Contact Info"}
            </button>
          </div>
        </div>

        {/* Shadow profile */}
        <div className="border-t border-ocean-800 pt-5">
          <p className="text-sm text-ocean-300 font-medium mb-2">
            Shadow Profile
          </p>
          <p className="text-xs text-ocean-500 mb-3">
            {profileId
              ? "This partner has a linked profile and can be added to chat threads."
              : "Create a shadow profile so this partner can be added to experience chat threads."}
          </p>
          {profileId ? (
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                Profile Active
              </span>
              <span className="text-xs text-ocean-500 font-mono">
                {profileId.slice(0, 8)}...
              </span>
            </div>
          ) : (
            <button
              onClick={handleCreateProfile}
              disabled={creating}
              className={cn(
                "w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                creating
                  ? "bg-ocean-800 text-ocean-500 cursor-not-allowed"
                  : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
              )}
            >
              {creating ? "Creating..." : "Create Shadow Profile"}
            </button>
          )}
        </div>

        {/* Outreach Messages */}
        <div className="border-t border-ocean-800 pt-5">
          <p className="text-sm text-ocean-300 font-medium mb-2">
            Partner Outreach
          </p>
          <p className="text-xs text-ocean-500 mb-3">
            Generate outreach messages in English, Spanish, and Portuguese to send to this partner.
          </p>
          <div className="space-y-2 mb-3">
            <input
              type="text"
              placeholder="Experience title (optional)"
              value={outreachTitle}
              onChange={(e) => setOutreachTitle(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Experience date (optional, e.g. March 15)"
              value={outreachDate}
              onChange={(e) => setOutreachDate(e.target.value)}
              className={inputClass}
            />
            <button
              onClick={handleGenerateOutreach}
              disabled={generatingOutreach}
              className={cn(
                "w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                generatingOutreach
                  ? "bg-ocean-800 text-ocean-500 cursor-not-allowed"
                  : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30",
              )}
            >
              {generatingOutreach ? "Generating..." : "Generate Outreach Messages"}
            </button>
          </div>

          {outreachMessages && (
            <div className="space-y-3 mt-4">
              {Object.entries(outreachMessages).map(([lang, text]) => (
                <div
                  key={lang}
                  className="bg-ocean-800 rounded-lg border border-ocean-700 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-ocean-300">
                      {langLabels[lang] ?? lang}
                    </span>
                    <button
                      onClick={() => handleCopyMessage(lang, text)}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium transition-colors",
                        copiedLang === lang
                          ? "bg-green-500/20 text-green-400"
                          : "bg-ocean-700 text-ocean-300 hover:text-white",
                      )}
                    >
                      {copiedLang === lang ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-ocean-200 whitespace-pre-line leading-relaxed">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        {message && (
          <p className="text-sm text-green-400">{message}</p>
        )}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
