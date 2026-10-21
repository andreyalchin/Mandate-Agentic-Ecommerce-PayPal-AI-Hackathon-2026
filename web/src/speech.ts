import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice input with the browser's Web Speech API (Chrome, Edge, Safari on macOS and iOS, Android Chrome).
 * Speech is transcribed by the browser; nothing is recorded or sent to Mandate's server.
 * `onFinal` fires once with the full transcript when the person stops talking.
 */
type Rec = any;
const Ctor: any = typeof window !== "undefined" ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;
export const speechSupported = !!Ctor;

export function useSpeech(opts: { onInterim?: (t: string) => void; onFinal?: (t: string) => void; onError?: (m: string) => void }) {
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(opts); cb.current = opts;
  const finalText = useRef("");

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    if (!Ctor || rec.current) return;
    const r: Rec = new Ctor();
    r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    finalText.current = "";
    r.onresult = (e: any) => {
      let interim = ""; let fin = "";
      for (let i = 0; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else interim += t; }
      finalText.current = fin;
      cb.current.onInterim?.((fin + interim).trim());
    };
    r.onerror = (e: any) => {
      const m = e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked. Allow it in your browser's site settings."
        : e.error === "no-speech" ? "Didn't catch that. Tap the mic and try again."
        : e.error === "network" ? "Voice input needs a connection to your browser's speech service."
        : e.error === "aborted" ? "" : `Voice input stopped (${e.error}).`;
      if (m) cb.current.onError?.(m);
    };
    r.onend = () => { rec.current = null; setListening(false); const t = finalText.current.trim(); if (t) cb.current.onFinal?.(t); };
    rec.current = r; setListening(true);
    try { r.start(); } catch { rec.current = null; setListening(false); }
  }, []);
  useEffect(() => () => rec.current?.abort?.(), []);
  return { supported: speechSupported, listening, start, stop, toggle: () => (rec.current ? stop() : start()) };
}
