import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, SendHorizontal, Trash2, X } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  projectId: number;
  projectName: string;
}

const SUGGESTIONS = [
  "Summarize the top vendors and their differentiators",
  "What are the biggest gaps across all vendors?",
  "Write an executive summary for the steering committee",
  "Compare implementation costs",
  "Identify top risks with the leading vendor",
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
  const [open, setOpen] = useState(false);
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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#d4a853] hover:bg-[#c49843] text-white shadow-lg flex items-center justify-center transition-all hover:scale-105"
          title="Caliber AI"
          data-testid="chat-toggle-button"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed top-0 right-0 z-40 h-full w-[420px] max-w-full bg-background border-l border-border/60 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          data-testid="chat-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#d4a853]" />
              <div>
                <h2 className="text-sm font-semibold">Caliber AI</h2>
                <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{projectName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
                disabled={messages.length === 0}
                data-testid="chat-clear-button"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                data-testid="chat-close-button"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !isStreaming && (
              <div className="space-y-4 pt-8">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#d4a853]/10 mb-3">
                    <Sparkles className="w-6 h-6 text-[#d4a853]" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">How can I help?</h3>
                  <p className="text-xs text-muted-foreground mt-1">Ask me anything about your vendor evaluation</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center px-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-[#d4a853]/30 text-[#d4a853] dark:text-[#d4a853] hover:bg-[#d4a853]/10 transition-colors text-left"
                      data-testid={`chat-suggestion-${i}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg ${
                    msg.role === "user"
                      ? "bg-[#1a2744] text-white rounded-br-sm"
                      : "bg-gray-100 dark:bg-gray-800 text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose-sm">{renderMarkdown(msg.content)}</div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && messages.length > 0 && messages[messages.length - 1].content === "" && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border/50 p-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about vendors, requirements, gaps..."
                rows={1}
                className="flex-1 resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4a853]/50 placeholder:text-muted-foreground"
                disabled={isStreaming}
                data-testid="chat-input"
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 bg-[#d4a853] hover:bg-[#c49843] text-white"
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                data-testid="chat-send-button"
              >
                <SendHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
