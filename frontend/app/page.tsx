"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";


const SUGGESTIONS = [
  "AI in the workplace",
  "Productivity tools",
  "Scientific research",
  "Remote work",
  "The future of education",
];

export default function LandingPage() {
  const router = useRouter();

  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null);

  function startChat(prefill?: string) {
    const params = new URLSearchParams();

    if (prefill) params.set("q", prefill);
    router.push(`/chat?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 py-16">

      {/* Title */}
      <div className="text-center mb-12 animate-fade-in">
        <p className="text-zinc-500 text-xs tracking-[0.3em] uppercase mb-4">
          AI-Powered Conversations
        </p>
        <h1 className="text-5xl font-bold text-white tracking-tight mb-4">
          Mini AI Interviewer
        </h1>
        <p className="text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">


          Choose a topic and take part in a short, adaptive interview.
          The AI asks one question at a time and summarizes your perspective at the end.


        </p>
      </div>



      {/* Suggestions */}
      <div className="mb-10 w-full max-w-lg">
        <p className="text-zinc-500 text-xs text-center mb-3 tracking-widest uppercase">
          Popular topics
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => startChat(s)}
              onMouseEnter={() => setHoveredSuggestion(s)}
              onMouseLeave={() => setHoveredSuggestion(null)}
              className={`text-xs px-4 py-2 rounded-full border transition-all ${
                hoveredSuggestion === s
                  ? "border-zinc-400 text-zinc-200 bg-zinc-800"
                  : "border-zinc-700 text-zinc-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={() => startChat()}
        className="px-8 py-3 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors mb-16"
      >
        Start Interview →
      </button>

      {/* About */}
      <div className="border-t border-zinc-800 pt-10 w-full max-w-lg text-center">
        <p className="text-zinc-500 text-xs tracking-widest uppercase mb-4">
          About
        </p>
        <p className="text-zinc-400 text-sm leading-relaxed">
          A short, adaptive interviewing experience built with Next.js,
          FastAPI, and Groq. Each interview explores one topic through
          thoughtful follow-up questions and concludes with a concise summary.
        </p>
        <div className="flex gap-4 justify-center mt-6">
          <a
            href="https://github.com/RipClaw15/interview-bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            GitHub →
          </a>
        </div>
      </div>

    </main>
  );
}
