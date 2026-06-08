"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MiniMarkdown } from "@/components/mini-markdown";
import { toast } from "sonner";
import type { CropHealthResult, ImageStress } from "@/lib/crop-science";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  locationName: string;
  tempC: number;
  rh: number;
  soil: number;
  result: CropHealthResult;
  imagePct: ImageStress | null;
  greenness: number | null;
}

const SUGGESTIONS = ["What should I do today?", "Is my soil moisture okay?", "Any disease risk?"];

export function CropChat({ locationName, tempC, rh, soil, result, imagePct, greenness }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const imageInfo = imagePct
      ? `Leaf image analysis: ${Math.round(imagePct.healthy)}% healthy, ${Math.round(imagePct.mild)}% mildly stressed, ${Math.round(imagePct.stressed)}% stressed. Mean VARI=${greenness?.toFixed(3) ?? "n/a"}.`
      : "No leaf image was uploaded.";

    const newMessages: Msg[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            locationName,
            tempC,
            rh,
            soil,
            vpd: result.vpd,
            chi: result.chi,
            category: result.category,
            scores: result.scores,
            imageInfo,
          },
          messages: newMessages,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Request failed");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed.");
      setMessages((m) => m.slice(0, -1)); // roll back the user msg on failure
      setInput(content);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 360 }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
              <Bot className="h-5 w-5" />
            </span>
            <p>Ask me anything about your field — I already know your current readings.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                  : "max-w-[90%] rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5 text-sm text-secondary-foreground"
              }
            >
              <MiniMarkdown text={m.content} />
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-secondary px-4 py-3">
              <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex items-center gap-2"
      >
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMessages([])}
            title="Clear chat"
            className="shrink-0 text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your crop…"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}
