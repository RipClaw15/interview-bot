"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  includeInHistory?: boolean;
}

interface InterviewState {
    topic: string;
    questionNumber: number;
    complete: boolean;
    interviewId: string;
}

interface TutorChatProps {
  initialMessage?: string;
}



const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function newMessage(
  role: Message["role"],
  content: string,
  includeInHistory = true,
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    includeInHistory,
  };
}

export default function TutorChat({ initialMessage = ""}: TutorChatProps) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState(initialMessage);
  const [streaming, setStreaming] = useState(false);
  const [state, setState]         = useState<InterviewState>({
      topic: "",
      questionNumber: 0,
      complete: false,
      interviewId: "",
  });
  const [sessionId, setSessionId]     = useState("");
  const [uploading, setUploading]     = useState(false);
  const [docUploaded, setDocUploaded] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);



  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: "smooth"});
  }, [messages]);

async function send() {
    const text = input.trim();
    if (!text || streaming || uploading || state.complete) return;

    const userMessage = newMessage("user", text);
    const assistantMessage = newMessage("assistant", "");
    const assistantMessageId = assistantMessage.id;
    const history = messages
      .filter((message) => message.includeInHistory !== false)
      .map(({role, content}) => ({role, content}));

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${BACKEND_URL}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
            message: text,
            history,
            topic: state.topic,
            question_number: state.questionNumber,
            interview_complete: state.complete,
            session_id: sessionId,
            provider: "groq",
        }),
      });

      if (!res.ok) {
        let detail = `Server error: ${res.status}`;
        try {
          const errorBody = await res.json();
          if (typeof errorBody.detail === "string") detail = errorBody.detail;
        } catch {
          // Keep the status-based fallback when the body is not JSON.
        }
        throw new Error(detail);
      }
      if (!res.body) throw new Error("Server returned an empty response");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? {...message, content: message.content + event.content}
                    : message
                )
              );
            }

            if (event.type === "state") {
              setState((prevousState) => ({
                topic:         event.topic,
                questionNumber: event.question_number,
                complete: event.interview_complete,
                interviewId: event.interview_id ?? prevousState.interviewId,
              }));
            }

            if (event.type === "error") {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? {...message, content: `Error: ${event.content}`}
                    : message
                )
              );
            }
          } catch {
            // malformed SSE line, skip
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: err.message || "Connection error. Is the backend running?",
                }
              : message
          )
        );
      }
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function releaseDocumentSession(id: string) {
    if (!id) return;
    try {
      await fetch(`${BACKEND_URL}/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch {
      // Backend TTL cleanup remains the fallback if the client disconnects.
    }
  }

  function reset() {
    abortRef.current?.abort();
    uploadAbortRef.current?.abort();
    const previousSessionId = sessionId;
    setMessages([]);
    setState({ topic: "", questionNumber: 0, complete: false, interviewId: "", });
    setInput("");
    setStreaming(false);
    setUploading(false);
    setSessionId("");
    setDocUploaded(false);
    setEmail("");
    setEmailStatus("");
    setIsSendingEmail(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void releaseDocumentSession(previousSessionId);
  }

  async function sendSummaryEmail() {
  if (isSendingEmail || !state.interviewId) return;

  const recipient = email.trim();

  if (!recipient) {
    setEmailStatus("Enter an email address.");
    return;
  }

  setIsSendingEmail(true);
  setEmailStatus("");

  try {
    const response = await fetch(
      `${BACKEND_URL}/interviews/${encodeURIComponent(state.interviewId)}/email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: recipient,
        }),
      },
    );

    if (!response.ok) {
      let detail = `Email could not be sent (${response.status}).`;

      try {
        const errorBody = await response.json();
        if (typeof errorBody.detail === "string") {
          detail = errorBody.detail;
        }
      } catch {
        // Keep the status-based fallback.
      }

      throw new Error(detail);
    }

    setEmailStatus("Summary sent ✓");
  } catch (error) {
    setEmailStatus(
      error instanceof Error
        ? error.message
        : "Email could not be sent.",
    );
  } finally {
    setIsSendingEmail(false);
  }
}



  // Upload file handler
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploading || streaming) return;

    setUploading(true);
    uploadAbortRef.current = new AbortController();
    const uploadMessage = newMessage(
      "assistant",
      `Uploading "${file.name}"...`,
      false,
    );
    const uploadMessageId = uploadMessage.id;

    // Immediately show uploading message in chat
    setMessages((prev) => [...prev, uploadMessage]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData,
        signal: uploadAbortRef.current.signal,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      const previousSessionId = sessionId;
      setSessionId(data.session_id);
      setDocUploaded(true);
      if (previousSessionId && previousSessionId !== data.session_id) {
        void releaseDocumentSession(previousSessionId);
      }

      // Replace the uploading message with success
      setMessages((prev) =>
        prev.map((message) =>
          message.id === uploadMessageId
            ? {
                ...message,
                content: `✓ "${file.name}" uploaded and indexed. I will use relevant experience from your CV to personalize the interview.`,
              }
            : message
        )
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;

      // Replace the uploading message with error
      setMessages((prev) =>
        prev.map((message) =>
          message.id === uploadMessageId
            ? {
                ...message,
                content: sessionId
                  ? "Failed to upload document. The previous document is still active."
                  : "Failed to upload document. Please try again.",
              }
            : message
        )
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // JSX

  return (
    <div className="flex h-screen bg-zinc-850 items-center justify-center">
      <div className="flex flex-col w-full max-w-5xl h-[95vh] bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden text-zinc-100">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to home"
              className="rounded-md text-lg font-semibold text-white transition-colors hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Mini AI Interviewer
            </Link>
            {state.topic && (
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {state.topic}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
          {state.complete && state.interviewId && (
            <span
              className="text-xs text-green-500"
              title={`Interview ID: ${state.interviewId}`}
            >
              Saved ✓
            </span>
          )}
          {state.questionNumber > 0 && (
            <span className="text-xs text-zinc-400">
              {state.complete
                ? "Interview complete"
                : `Question ${state.questionNumber} of 4`}
            </span>
            )}
            <button
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              new interview
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <p className="text-zinc-500 text-sm max-w-sm">
                Choose a topic and share your perspective through four short questions.
                The interviewer will adapt its follow-up questions to your answers.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "AI in the workplace",
                  "Productivity tools",
                  "The future of education",
                  ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-zinc-800 text-zinc-100 rounded-br-sm"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-sm"
                }`}
              >
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                  <span className="inline-block w-0.5 h-3.5 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-zinc-800">
          {state.complete && state.interviewId && (
  <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
    <p className="text-sm font-medium text-zinc-100">
      Email your interview result
    </p>

    <p className="mt-1 text-xs text-zinc-400">
      Receive the final summary and complete JSON transcript.
    </p>

    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        void sendSummaryEmail();
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setEmailStatus("");
        }}
        placeholder="you@example.com"
        aria-label="Email address for interview results"
        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
      />

      <button
        type="submit"
        disabled={isSendingEmail || !email.trim()}
        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {isSendingEmail ? "Sending..." : "Send summary"}
      </button>
    </form>

    {emailStatus && (
      <p className="mt-2 text-xs text-zinc-400" role="status">
        {emailStatus}
      </p>
    )}
  </div>
)}
                        <div className="flex gap-3 items-end">
                          <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={state.complete}
                            placeholder={
                                state.complete
                                  ? "Interview complete"
                                  : state.questionNumber === 0
                                    ? "Enter an interview topic..."
                                    : "Write your answer..."
                            }
                            rows={5}
                className="flex-1 resize-y bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                style={{ minHeight: "80px", maxHeight: "300px" }}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                className="hidden"
                aria-label="Upload CV as a PDF"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || streaming || state.complete}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors border ${
                  docUploaded
                    ? "border-green-500 text-green-500"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {uploading ? "..." : docUploaded ? "CV ✓" : "Upload CV"}
              </button>

              <button
                onClick={send}
                disabled={streaming || uploading || state.complete || !input.trim()}
                className="px-4 py-3 rounded-xl bg-white text-zinc-950 text-sm font-medium hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {state.complete ? "Complete" : streaming ? "..." : "Send"}
              </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            Enter to send · Shift+Enter for new line
          </p>
        </div>

      </div>
    </div>
  );
}
