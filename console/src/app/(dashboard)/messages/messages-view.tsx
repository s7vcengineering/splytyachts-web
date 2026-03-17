"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPLYT_ADMIN_ID = "00000000-0000-0000-0000-000000000000";
const SPLYT_AVATAR = "/splyt-admin-avatar.svg";

interface Thread {
  id: string;
  experience_id: string | null;
  experience_title: string | null;
  is_direct_message: boolean;
  member_ids: string[];
  updated_at: string;
  latest_message: {
    content: string;
    sender_name: string;
    sender_id: string;
    created_at: string;
  } | null;
  members: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  }[];
}

interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar_url: string | null;
  content: string;
  image_url: string | null;
  is_pinned: boolean;
  created_at: string;
}

interface UserResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export function MessagesView() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [msgInput, setMsgInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchThreads = useCallback(async () => {
    const res = await fetch(
      `/api/messages/threads?q=${encodeURIComponent(search)}`,
    );
    const data = await res.json();
    setThreads(data.threads || []);
    setLoading(false);
  }, [search]);

  const fetchMessages = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/messages/${threadId}`);
    const data = await res.json();
    setMessages(data.messages || []);
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id);
      // Poll for new messages every 4 seconds
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(
        () => fetchMessages(selectedThread.id),
        4000,
      );
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [selectedThread, fetchMessages]);

  useEffect(() => {
    if (!userSearch || userSearch.length < 2) {
      setUserResults([]);
      return;
    }
    setSearchingUsers(true);
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/messages/users?q=${encodeURIComponent(userSearch)}`,
      );
      const data = await res.json();
      setUserResults(data.users || []);
      setSearchingUsers(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  async function sendMessage() {
    if (!msgInput.trim() || !selectedThread) return;
    setSendingMsg(true);
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: selectedThread.id,
        content: msgInput.trim(),
      }),
    });
    setMsgInput("");
    setSendingMsg(false);
    fetchMessages(selectedThread.id);
    fetchThreads();
  }

  async function startNewChat(user: UserResult) {
    setSendingMsg(true);
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_id: user.id,
        content: `Hi ${user.display_name || "there"}! This is SPLYT Admin.`,
      }),
    });
    const data = await res.json();
    setSendingMsg(false);
    setShowNewChat(false);
    setUserSearch("");
    await fetchThreads();
    // Select the new thread
    const newThread = threads.find((t) => t.id === data.thread_id);
    if (newThread) {
      setSelectedThread(newThread);
    } else {
      // Refetch and select
      const res2 = await fetch("/api/messages/threads?q=");
      const data2 = await res2.json();
      setThreads(data2.threads || []);
      const found = (data2.threads || []).find(
        (t: Thread) => t.id === data.thread_id,
      );
      if (found) setSelectedThread(found);
    }
  }

  function threadDisplayName(thread: Thread) {
    if (thread.experience_title && !thread.is_direct_message) {
      return thread.experience_title;
    }
    const nonAdmin = thread.members.filter((m) => m.id !== SPLYT_ADMIN_ID);
    if (nonAdmin.length > 0) {
      return nonAdmin.map((m) => m.display_name || "User").join(", ");
    }
    return thread.experience_title || "Thread";
  }

  function memberAvatars(thread: Thread) {
    return thread.members
      .filter((m) => m.id !== SPLYT_ADMIN_ID)
      .slice(0, 3);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Messages</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-800 text-ocean-300">
            {threads.length} threads
          </span>
        </div>
        <button
          onClick={() => setShowNewChat(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
        >
          New Message
        </button>
      </div>

      <div className="flex flex-1 gap-0 bg-ocean-900 rounded-xl border border-ocean-700 overflow-hidden min-h-0">
        {/* Thread list */}
        <div className="w-80 border-r border-ocean-700 flex flex-col shrink-0">
          <div className="p-3 border-b border-ocean-700">
            <input
              type="text"
              placeholder="Search threads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-ocean-800 border border-ocean-600 rounded-lg px-3 py-2 text-sm text-white placeholder-ocean-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-ocean-500 text-sm">
                Loading...
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-center text-ocean-500 text-sm">
                No threads found
              </div>
            ) : (
              threads.map((thread) => {
                const avatars = memberAvatars(thread);
                return (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedThread(thread)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-ocean-800 hover:bg-ocean-800/50 transition-colors",
                      selectedThread?.id === thread.id && "bg-ocean-800",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex -space-x-2 shrink-0 mt-0.5">
                        {avatars.length > 0 ? (
                          avatars.map((m, i) =>
                            m.avatar_url ? (
                              <img
                                key={m.id || i}
                                src={m.avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full border-2 border-ocean-900 object-cover"
                              />
                            ) : (
                              <div
                                key={m.id || i}
                                className="w-8 h-8 rounded-full border-2 border-ocean-900 bg-ocean-700 flex items-center justify-center text-ocean-400 text-xs font-bold"
                              >
                                {(m.display_name || "?")[0]?.toUpperCase()}
                              </div>
                            ),
                          )
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-xs font-bold">
                            ?
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white truncate">
                            {threadDisplayName(thread)}
                          </p>
                          {thread.latest_message && (
                            <span className="text-[10px] text-ocean-500 shrink-0 ml-2">
                              {timeAgo(thread.latest_message.created_at)}
                            </span>
                          )}
                        </div>
                        {!thread.is_direct_message && (
                          <p className="text-[10px] text-ocean-500 mt-0.5">
                            {thread.members.length} members
                          </p>
                        )}
                        {thread.latest_message && (
                          <p className="text-xs text-ocean-400 truncate mt-1">
                            <span className="text-ocean-500">
                              {thread.latest_message.sender_id ===
                              SPLYT_ADMIN_ID
                                ? "SPLYT"
                                : thread.latest_message.sender_name || "User"}
                              :{" "}
                            </span>
                            {thread.latest_message.content}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedThread ? (
            <>
              {/* Thread header */}
              <div className="px-6 py-4 border-b border-ocean-700 flex items-center gap-3">
                <img
                  src={SPLYT_AVATAR}
                  alt="SPLYT"
                  className="w-8 h-8 rounded-full"
                />
                <div>
                  <p className="text-white font-semibold text-sm">
                    {threadDisplayName(selectedThread)}
                  </p>
                  <p className="text-[10px] text-ocean-500">
                    {selectedThread.is_direct_message
                      ? "Direct message"
                      : `Experience thread \u00b7 ${selectedThread.members.length} members`}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {messages.map((msg) => {
                  const isAdmin = msg.sender_id === SPLYT_ADMIN_ID;
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-3",
                        isAdmin && "flex-row-reverse",
                      )}
                    >
                      {isAdmin ? (
                        <img
                          src={SPLYT_AVATAR}
                          alt="SPLYT"
                          className="w-8 h-8 rounded-full shrink-0"
                        />
                      ) : msg.sender_avatar_url ? (
                        <img
                          src={msg.sender_avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-xs font-bold shrink-0">
                          {(msg.sender_name || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[70%]",
                          isAdmin ? "text-right" : "",
                        )}
                      >
                        <p className="text-[10px] text-ocean-500 mb-1">
                          {isAdmin
                            ? "SPLYT"
                            : msg.sender_name || "User"}{" "}
                          &middot;{" "}
                          {new Date(msg.created_at).toLocaleTimeString(
                            "en-US",
                            {
                              hour: "numeric",
                              minute: "2-digit",
                            },
                          )}
                        </p>
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2.5 text-sm inline-block",
                            isAdmin
                              ? "bg-cyan-500/20 text-cyan-100 rounded-tr-md"
                              : "bg-ocean-800 text-ocean-200 rounded-tl-md",
                          )}
                        >
                          {msg.content}
                        </div>
                        {msg.image_url && (
                          <img
                            src={msg.image_url}
                            alt=""
                            className="mt-2 max-w-xs rounded-xl border border-ocean-700"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-6 py-4 border-t border-ocean-700">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={msgInput}
                    onChange={(e) => setMsgInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Message as SPLYT Admin..."
                    className="flex-1 bg-ocean-800 border border-ocean-600 rounded-xl px-4 py-3 text-sm text-white placeholder-ocean-500 focus:outline-none focus:border-cyan-500/50"
                    disabled={sendingMsg}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sendingMsg || !msgInput.trim()}
                    className="px-5 py-3 rounded-xl text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:hover:bg-cyan-600 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <img
                  src={SPLYT_AVATAR}
                  alt="SPLYT"
                  className="w-16 h-16 rounded-full mx-auto mb-4 opacity-50"
                />
                <p className="text-ocean-400 font-medium">
                  Select a thread to view messages
                </p>
                <p className="text-ocean-500 text-sm mt-1">
                  Or start a new conversation
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-ocean-900 border border-ocean-700 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                New Message
              </h3>
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setUserSearch("");
                  setUserResults([]);
                }}
                className="text-ocean-400 hover:text-white transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full bg-ocean-800 border border-ocean-600 rounded-lg px-4 py-3 text-sm text-white placeholder-ocean-500 focus:outline-none focus:border-cyan-500/50 mb-3"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searchingUsers ? (
                <p className="text-center text-ocean-500 text-sm py-4">
                  Searching...
                </p>
              ) : userResults.length === 0 && userSearch.length >= 2 ? (
                <p className="text-center text-ocean-500 text-sm py-4">
                  No users found
                </p>
              ) : (
                userResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => startNewChat(user)}
                    disabled={sendingMsg}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ocean-800 transition-colors text-left disabled:opacity-50"
                  >
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-ocean-700 flex items-center justify-center text-ocean-400 text-sm font-bold">
                        {(user.display_name || "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {user.display_name || "Anonymous"}
                      </p>
                      {user.email && (
                        <p className="text-xs text-ocean-400">{user.email}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
