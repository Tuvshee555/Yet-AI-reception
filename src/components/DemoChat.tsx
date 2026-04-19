/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useRef, useState } from "react";

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function DemoChat() {
  const [messages, setMessages] = useState<
    { from: "user" | "bot"; text: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    if (!input || sending) return;
    setMessages((s) => [...s, { from: "user", text: input }]);
    const text = input;
    setInput("");
    setSending(true);
    try {
      const r = await fetch("/api/demo", {
        method: "POST",
        body: JSON.stringify({ text }),
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      setMessages((s) => [...s, { from: "bot", text: j.reply || "..." }]);
    } catch (e) {
      setMessages((s) => [
        ...s,
        { from: "bot", text: "Уучлаарай, сервертэй холбогдоход алдаа гарлаа." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="border rounded p-4 h-80 overflow-auto mb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.from === "user" ? "text-right" : "text-left"}
          >
            <div className="inline-block p-2 my-1 rounded bg-gray-100">
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="text-left">
            <div className="inline-block p-2 my-1 rounded bg-gray-100">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 p-2 border rounded"
          placeholder="Хөтөлбөр, үнэ, тэтгэлгийн талаар асуугаарай..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={sending}
        />
        <button
          onClick={send}
          className="p-2 border rounded"
          disabled={sending}
        >
          {sending ? "Илгээж байна..." : "Илгээх"}
        </button>
      </div>
    </div>
  );
}
