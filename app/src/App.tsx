import { useEffect, useRef, useState } from "react";
import { buildSearcher, buildPrompt, chatStream, checkOllama, type Doc, type Hit } from "./rag";

type Status = { ollama: boolean; chat: boolean; embed: boolean; docs: number };

function Badge({ on, label }: { on: boolean; label: string }) {
  return <span style={{ marginRight: 8, padding: "2px 6px", borderRadius: 4, background: on ? "#dcfce7" : "#fee2e2", color: on ? "#166534" : "#991b1b" }}>{on ? "●" : "○"} {label}</span>;
}

export default function App() {
  const [status, setStatus] = useState<Status>({ ollama: false, chat: false, embed: false, docs: 0 });
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [weak, setWeak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"" | "up" | "down">("");
  const searcher = useRef<ReturnType<typeof buildSearcher> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("senior-docs.json").then((r) => r.json()).then((d: Doc[]) => {
      searcher.current = buildSearcher(d);
      setStatus((s) => ({ ...s, docs: d.length }));
    });
    checkOllama().then((o) => setStatus((s) => ({ ...s, ollama: o.ok, chat: o.hasChat, embed: o.hasEmbed })));
  }, []);

  async function ask() {
    if (!query.trim() || !searcher.current || busy) return;
    setBusy(true); setAnswer(""); setHits([]); setFeedback("");
    try {
      const res = await searcher.current(query);
      setWeak(res.weak);
      if (res.refuse) { setHits([]); setAnswer("죄송합니다. 이 질문은 안내 범위 밖이거나 자료에 근거가 없어 정확히 답변드리기 어렵습니다. 디지털배움터 이용, 보이스피싱·스미싱 예방, 무인민원발급기·정부24 이용 등에 대해 물어봐 주세요."); return; }
      setHits(res.hits.slice(0, 6));
      const { system, user } = buildPrompt(query, res.hits, res.weak);
      abort.current = new AbortController();
      let acc = "";
      for await (const chunk of chatStream(system, user, abort.current.signal)) { acc += chunk; setAnswer(acc); }
    } catch (e) {
      setAnswer("오류: " + (e as Error).message);
    } finally {
      setBusy(false); abort.current = null;
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 20, fontFamily: "system-ui", textAlign: "left" }}>
      <h1 style={{ fontSize: 22 }}>어르신 디지털 안내 챗봇</h1>
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        <Badge on={status.ollama} label="Ollama 연결" />
        <Badge on={status.chat} label="qwen3.5:2b" />
        <Badge on={status.embed} label="embeddinggemma" />
        <span style={{ marginLeft: 4, color: "#666" }}>자료 {status.docs}개</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="예: 교육비가 드나요?" disabled={busy} style={{ flex: 1, padding: 8 }} />
        <button onClick={ask} disabled={busy}>{busy ? "..." : "질문"}</button>
        {busy && <button onClick={() => abort.current?.abort()}>중지</button>}
      </div>
      {weak && !!answer && <p style={{ color: "#b45309", marginTop: 12 }}>⚠️ 근거가 약합니다 — 조심스러운 답변입니다</p>}
      {!!answer && <div style={{ marginTop: 16, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{answer}</div>}
      {hits.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#666" }}>출처 (근거)</div>
          {hits.map((h) => (
            <a key={h.id} href={h.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", margin: "4px 6px 0 0", padding: "3px 8px", fontSize: 12, border: "1px solid #ccc", borderRadius: 4, textDecoration: "none", color: "#333" }}>
              [{h.id}] {h.section} · {h.method} {h.cosine.toFixed(2)}
            </a>
          ))}
        </div>
      )}
      {!!answer && !busy && (
        <div style={{ marginTop: 16, fontSize: 13 }}>
          도움이 되었나요?{" "}
          <button onClick={() => setFeedback("up")} style={{ opacity: feedback === "up" ? 1 : 0.4 }}>👍</button>
          <button onClick={() => setFeedback("down")} style={{ opacity: feedback === "down" ? 1 : 0.4 }}>👎</button>
        </div>
      )}
    </main>
  );
}
