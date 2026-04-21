import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Sparkles, SendHorizontal, Trash2, X } from "lucide-react";

const API_BASE = "";

interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  projectId: number | string;
  projectName: string;
}

const PROJECT_SUGGESTIONS = [
  "Summarize the current project health and top risks",
  "What are the critical issues that need attention?",
  "Write an executive summary for the steering committee",
  "What's the go-live readiness status?",
  "Compare vendor strengths and weaknesses",
];

const GENERAL_SUGGESTIONS = [
  "What can Caliber help me with?",
  "How do I set up a new project?",
  "Walk me through the discovery process",
  "What does a health check assessment involve?",
  "How does the vendor evaluation work?",
];

function renderMarkdown(text: string): JSX.Element {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (listBuffer.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={`list-${elements.length}`} className={listType === "ul" ? "list-disc pl-4 my-1 space-y-0.5" : "list-decimal pl-4 my-1 space-y-0.5"}>
          {listBuffer.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
      listBuffer = [];
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={i} className="font-semibold text-sm mt-2 mb-0.5">{renderInline(line.slice(4))}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={i} className="font-semibold text-sm mt-2 mb-0.5">{renderInline(line.slice(3))}</h3>);
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={i} className="font-bold text-sm mt-2 mb-0.5">{renderInline(line.slice(2))}</h2>);
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(line.replace(/^[-*]\s/, ""));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(line.replace(/^\d+\.\s/, ""));
      continue;
    }

    flushList();

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
  }

  flushList();
  return <>{elements}</>;
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  // Bold **text**
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`b-${match.index}`} className="font-semibold">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

export function ChatPanel({ projectId, projectName }: ChatPanelProps) {
  const [open, setOpen] = useState(() => {
    // Auto-open on first visit (per session)
    const key = "caliber_chat_shown";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      return true;
    }
    return false;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history
  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: ["/api/projects", projectId, "chat", "history"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/chat/history`).then(r => r.json()),
    enabled: open && !historyLoaded,
  });

  useEffect(() => {
    if (history && !historyLoaded) {
      setMessages(history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
      setHistoryLoaded(true);
    }
  }, [history, historyLoaded]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 96) + "px";
    }
  }, [input]);

  const handleSend = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isStreaming) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: messageText };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    // Add empty assistant message placeholder
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const recentHistory = messages.slice(-20).map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText, history: recentHistory }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to connect to chat");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text" && data.text) {
                fullText += data.text;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullText };
                  return updated;
                });
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Sorry, I encountered an error. Please try again." };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, projectId]);

  const handleClear = async () => {
    try {
      await apiRequest("DELETE", `/api/projects/${projectId}/chat/history`);
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "chat", "history"] });
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-16 items-center gap-3 rounded-full border border-white/40 bg-slate-950/95 px-4 text-white shadow-2xl shadow-slate-950/25 transition-all hover:scale-[1.02] hover:bg-slate-900 dark:border-white/10"
          title="Caliber AI"
          data-testid="chat-toggle-button"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-slate-950">
            <Sparkles className="w-5 h-5" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold">Caliber AI</span>
            <span className="block text-xs text-white/65">Ask about delivery health</span>
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="glass-panel-strong fixed right-3 top-3 z-40 flex h-[calc(100%-1.5rem)] w-[440px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-[30px] border border-white/40 animate-in slide-in-from-right duration-200 dark:border-white/10"
          data-testid="chat-panel"
        >
          {/* Header */}
          <div className="hero-surface shrink-0 border-b border-white/10 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                  <Sparkles className="w-5 h-5 text-amber-100" />
                </span>
              <div>
                  <h2 className="text-base font-semibold tracking-[-0.03em]">Caliber AI</h2>
                  <p className="max-w-[220px] truncate text-xs text-white/70">{projectName}</p>
                  <p className="mt-1 text-xs text-white/60">Delivery copilot for summaries, risks, and readiness.</p>
              </div>
            </div>
              <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                  className="h-9 w-9 rounded-2xl text-white/70 hover:bg-white/10 hover:text-white"
                onClick={handleClear}
                disabled={messages.length === 0}
                data-testid="chat-clear-button"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                  className="h-9 w-9 rounded-2xl text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
                data-testid="chat-close-button"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="app-scrollbar flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.45),rgba(255,255,255,0))] p-5 space-y-4 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]">
            {messages.length === 0 && !isStreaming && (
              <div className="space-y-5 pt-8">
                <div className="text-center">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] bg-amber-400/15 mb-4">
                    <Sparkles className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">How can I help?</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{projectId && projectId !== "0" ? "Ask me anything about this project workspace." : "Ask for setup help, process guidance, or delivery summaries."}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center px-2">
                  {(projectId && projectId !== "0" ? PROJECT_SUGGESTIONS : GENERAL_SUGGESTIONS).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-left text-xs font-medium text-foreground shadow-xs transition-colors hover:border-amber-300/70 hover:bg-amber-50 dark:bg-white/5 dark:hover:bg-white/10"
                      data-testid={`chat-suggestion-${i}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Executive summaries, risk scans, and program status are great places to start.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-[24px] px-4 py-3 shadow-xs ${
                    msg.role === "user"
                      ? "hero-surface rounded-br-md text-white"
                      : "border border-white/55 bg-white/85 text-foreground rounded-bl-md dark:border-white/10 dark:bg-white/5"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose-sm text-sm leading-6">{renderMarkdown(msg.content)}</div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && messages.length > 0 && messages[messages.length - 1].content === "" && (
              <div className="flex justify-start">
                <div className="rounded-[24px] rounded-bl-md border border-white/55 bg-white/85 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border/50 bg-background/60 p-4 backdrop-blur">
            <div className="flex items-end gap-3 rounded-[24px] border border-white/55 bg-white/80 p-3 shadow-xs dark:border-white/10 dark:bg-white/5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about project health, risks, vendors..."
                rows={1}
                className="flex-1 resize-none bg-transparent px-1 py-2 text-sm focus:outline-none placeholder:text-muted-foreground"
                disabled={isStreaming}
                data-testid="chat-input"
              />
              <Button
                size="icon"
                className="hero-surface h-11 w-11 shrink-0 rounded-2xl text-accent-foreground hover:opacity-95"
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                data-testid="chat-send-button"
              >
                <SendHorizontal className="w-4 h-4" />
              </Button>
            </div>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">
              Press Enter to send. Use Shift+Enter for a new line.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
