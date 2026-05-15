"use client";

import { useState } from "react";

interface AuthGateProps {
  onAuthenticated: (token: string) => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    localStorage.setItem("auth_token", token.trim());
    onAuthenticated(token.trim());
  }

  return (
    <div className="fixed inset-0 bg-(--bg) z-50 flex items-center justify-center relative">
      <div className="w-full max-w-[420px] px-6">
        <div className="text-center mb-10">
          <div className="font-['Orbitron'] text-[1.6rem] font-black text-(--lime) tracking-widest leading-none shadow-[0_0_20px_rgba(57,255,90,0.4)]">
            BULK ANALYZER
          </div>
          <div className="mt-2 text-(--red) text-[0.7rem] tracking-[0.3em] uppercase">
            Authentication Required
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={`neon-border flex items-center bg-(--bg-panel) pl-4 ${error ? "border-(--red)" : ""}`}>
            <span className="text-(--lime-dim) text-[0.75rem] mr-2.5 shrink-0 font-['Share_Tech_Mono'] tracking-widest">
              TOKEN://
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(false); }}
              placeholder="enter access token"
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-(--text) font-['Share_Tech_Mono'] text-[0.9rem] py-3.5 caret-(--lime) tracking-widest"
            />
          </div>
          {error && (
            <div className="mt-2 text-(--red) text-[0.72rem] tracking-widest pl-1">⚠ Invalid token</div>
          )}
          <button
            type="submit"
            disabled={!token.trim()}
            className="w-full mt-4 bg-(--lime) disabled:bg-(--lime-dim) text-[#060a08] border-none py-3 font-['Orbitron'] font-bold text-[0.7rem] tracking-widest cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            AUTHENTICATE
          </button>
        </form>

        <div className="mt-6 text-(--text-muted) text-[0.62rem] tracking-widest text-center">
          Set AUTH_TOKEN env var in docker-compose.yml to enable auth
        </div>
      </div>
    </div>
  );
}
