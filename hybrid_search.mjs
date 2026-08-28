// 하이브리드 검색: 코사인(top-10) + BM25 바이그램(top-5) + RRF 융합
// 실행: node hybrid_search.mjs   (senior-docs.json + Ollama 필요)
import { readFileSync } from "node:fs";
const OLLAMA = "http://localhost:11434/api/embed";
const MODEL = "embeddinggemma";
const THRESHOLD = 0.33;            // 약한 근거 기준(우리 척도 보정값)
const K_VEC = 10, K_BM25 = 5, RRF_K = 60;
const docs = JSON.parse(readFileSync("senior-docs.json", "utf-8"));

async function embed(t) {
  const r = await fetch(OLLAMA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, input: t }) });
  return (await r.json()).embeddings[0];
}
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; } return d/Math.sqrt(na*nb); }

function bigrams(s) { const c = s.replace(/\s+/g, ""); const g = []; for (let i = 0; i < c.length - 1; i++) g.push(c.slice(i, i+2)); return g; }
const N = docs.length;
const docToks = docs.map((d) => bigrams(d.text));
const avgdl = docToks.reduce((s, t) => s + t.length, 0) / N;
const df = {};
for (const toks of docToks) for (const w of new Set(toks)) df[w] = (df[w]||0) + 1;
function bm25(qToks, i) {
  const toks = docToks[i], dl = toks.length, tf = {};
  for (const w of toks) tf[w] = (tf[w]||0) + 1;
  const k1 = 1.5, b = 0.75; let s = 0;
  for (const w of new Set(qToks)) {
    if (!tf[w]) continue;
    const idf = Math.log(1 + (N - df[w] + 0.5)/(df[w] + 0.5));
    s += idf * (tf[w]*(k1+1))/(tf[w] + k1*(1 - b + b*dl/avgdl));
  }
  return s;
}
function rankAdd(map, arr, key) { arr.forEach((r, idx) => { const e = map.get(r.i) || { i: r.i }; e[key] = r.score; e[key+"Rank"] = idx+1; map.set(r.i, e); }); }

async function search(query) {
  const qv = await embed(query);
  const vec = docs.map((d, i) => ({ i, score: cos(qv, d.vector) })).sort((a,b)=>b.score-a.score);
  const qT = bigrams(query);
  const bm = docs.map((d, i) => ({ i, score: bm25(qT, i) })).sort((a,b)=>b.score-a.score);
  const m = new Map();
  rankAdd(m, vec.slice(0, K_VEC), "vector");
  rankAdd(m, bm.slice(0, K_BM25).filter(x=>x.score>0), "bm25");
  const fused = [...m.values()].map((e) => {
    const rrf = (e.vectorRank ? 1/(RRF_K+e.vectorRank) : 0) + (e.bm25Rank ? 1/(RRF_K+e.bm25Rank) : 0);
    const method = e.vector != null && e.bm25 != null ? "both" : e.vector != null ? "vector" : "bm25";
    return { id: docs[e.i].id, section: docs[e.i].section, cosine: e.vector ?? cos(qv, docs[e.i].vector), bm25: e.bm25 ?? 0, method, rrf };
  }).sort((a,b)=>b.rrf-a.rrf);
  const maxCos = Math.max(...fused.map(f=>f.cosine));
  return { fused, weak: maxCos < THRESHOLD, maxCos };
}

const queries = ["교육비가 드나요?", "어디에 문의하나요?", "키오스크 사용법도 배울 수 있나요?", "오늘 서울 날씨 알려줘"];
for (const q of queries) {
  const { fused, weak, maxCos } = await search(q);
  console.log(`\n[Q] ${q}  (약한근거:${weak?"예":"아니오"} maxCos=${maxCos.toFixed(3)})`);
  for (const r of fused.slice(0, 4)) console.log(`  rrf=${r.rrf.toFixed(4)} cos=${r.cosine.toFixed(3)} bm25=${r.bm25.toFixed(2)} ${r.method.padEnd(6)} ${r.id} ${r.section}`);
}
