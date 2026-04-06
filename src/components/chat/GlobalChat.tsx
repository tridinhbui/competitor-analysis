"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Trash2, CloudOff, Cloud } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const LS_KEY = "dividend-iq-chat";

function loadLocalChat(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalChat(msgs: ChatMsg[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(msgs)); } catch { /* noop */ }
}

const QUICK_ACTIONS = [
  "How do I analyze a company?",
  "Explain operating margin",
  "What is the workspace for?",
  "How to compare peers?",
];

export function GlobalChat() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Load messages based on auth state
  useEffect(() => {
    if (isLoggedIn) {
      loadDbChat();
    } else {
      setMessages(loadLocalChat());
      setThreadId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const loadDbChat = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/chat/threads");
      if (res.status === 401) return;
      const data = await res.json();
      const threads: Array<{ id: string }> = data.threads ?? [];

      if (threads.length === 0) {
        // Create a default thread for the user
        const created = await fetchWithAuth("/api/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "My chat" }),
        });
        if (created.ok) {
          const { thread } = await created.json();
          setThreadId(thread.id);
          setMessages([]);
        }
        return;
      }

      const latest = threads[0];
      setThreadId(latest.id);

      const msgRes = await fetchWithAuth(`/api/chat/threads/${latest.id}/messages`);
      if (!msgRes.ok) return;
      const msgData = await msgRes.json();
      const dbMsgs: Array<{ role: string; content: string }> = msgData.messages ?? [];
      setMessages(
        dbMsgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      );
    } catch { /* noop */ }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });
      const data = await res.json();
      const reply = data.message ?? data.error ?? "Sorry, something went wrong.";
      const assistantMsg: ChatMsg = { role: "assistant", content: reply };
      const withReply = [...updated, assistantMsg];
      setMessages(withReply);

      if (isLoggedIn && threadId) {
        // Persist both messages to DB (fire-and-forget)
        fetchWithAuth(`/api/chat/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [userMsg, assistantMsg],
          }),
        }).catch(() => {});
      } else {
        // Guest mode: save to localStorage
        saveLocalChat(withReply);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to reach the assistant. Check your connection." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, isLoggedIn, threadId]);

  const clearChat = async () => {
    setMessages([]);
    if (isLoggedIn && threadId) {
      // Create a fresh thread so old messages are archived
      try {
        const res = await fetchWithAuth("/api/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "My chat" }),
        });
        if (res.ok) {
          const { thread } = await res.json();
          setThreadId(thread.id);
        }
      } catch { /* noop */ }
    } else {
      localStorage.removeItem(LS_KEY);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Dividend IQ Assistant</h3>
              <p className="flex items-center gap-1 text-[10px] text-slate-400">
                {isLoggedIn ? (
                  <>
                    <Cloud className="h-3 w-3 text-emerald-500" aria-hidden />
                    Signed in — chat saved to your account
                  </>
                ) : (
                  <>
                    <CloudOff className="h-3 w-3 text-amber-400" aria-hidden />
                    Guest mode — chat is local only
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Hi! I&apos;m your Dividend IQ assistant. I can help you navigate the app, explain financial metrics, and guide your analysis.
                </div>
                <div className="space-y-1.5">
                  {QUICK_ACTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-primary/30 hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user" ? "bg-primary text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-slate-100 px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                placeholder="Ask anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="rounded-lg bg-primary p-2 text-white transition hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 100); }}
        className={`fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 ${
          open ? "bg-slate-700 text-white" : "bg-primary text-white animate-pulse"
        }`}
        style={{ animationIterationCount: 3 }}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </>
  );
}
