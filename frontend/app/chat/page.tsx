"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import TutorChat from "../components/TutorChat";

function ChatWithParams() {
  const searchParams = useSearchParams();
  const prefill = searchParams.get("q") || "";

  return <TutorChat initialMessage={prefill} />;
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatWithParams />
    </Suspense>
  );
}
