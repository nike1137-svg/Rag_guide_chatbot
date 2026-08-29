// eval_judge_gemini.mjs — judge 이중화: 기존 로컬 judge(qwen3.5:2b) 결과를 Gemini API judge로 재판정해 비교
// 원칙: 답변·검색 컨텍스트는 기존 eval-results.json을 그대로 재사용(변수 하나 = judge 모델만 교체)
// 키 보안: ~/.config/gemini/api.key에서 직접 읽어 환경변수로만 사용하고 결과/로그에 절대 출력하지 않는다.
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const OLLAMA = "http://localhost:11434";
const EMBED_MODEL = "embeddinggemma";
const THRESHOLD = 0.33;
const REFUSE = 0.30;
const BM25_MIN = 6.0;
const K_VEC = 10, K_BM25 = 5, RRF_K = 60;
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const API_KEY = (await readFile(join(homedir(), ".config/gemini/api.key"), "utf8")).trim();
if (!API_KEY) throw new Error("API 키가 비어 있습니다");

function bigrams(s) { const c = s.replace(/\s+/g, ""); const g = []; for (let i = 0; i < c.length - 1; i++) g.push(c.slice(i, i + 2)); return g; }
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / Math.sqrt(na * nb); }

async function embed(text) {
  const r = await fetch(`${OLLAMA}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: EMBED_MODEL, input: text }) });
  if (!r.ok) throw new Error(`임베딩 실패 ${r.status}`);
  return (await r.json()).embeddings[0];
}

function buildSearcher(docs) {
  const N = docs.length;
  const docToks = docs.map((d) => bigrams(d.text));
  const avgdl = docToks.reduce((s, t) => s + t.length, 0) / N;
  const df = {};
  for (const toks of docToks) for (const w of new Set(toks)) df[w] = (df[w] || 0) + 1;
  function bm25(qToks, i) {
    const toks = docToks[i], dl = toks.length, tf = {};
    for (const w of toks) tf[w] = (tf[w] || 0) + 1;
    const k1 = 1.5, b = 0.75; let s = 0;
    for (const w of new Set(qToks)) { if (!tf[w]) continue; const idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); s += idf * (tf[w] * (k1 + 1)) / (tf[w] + k1 * (1 - b + b * dl / avgdl)); }
    return s;
  }
  return async function search(query) {
    const qv = await embed(query);
    const vec = docs.map((d, i) => ({ i, score: cos(qv, d.vector) })).sort((a, b) => b.score - a.score);
    const qT = bigrams(query);
    const bm = docs.map((d, i) => ({ i, score: bm25(qT, i) })).sort((a, b) => b.score - a.score);
    const m = new Map();
    const add = (arr, key) => arr.forEach((r, idx) => { const e = m.get(r.i) || { i: r.i }; e[key] = r.score; e[key + "Rank"] = idx + 1; m.set(r.i, e); });
    add(vec.slice(0, K_VEC), "vector");
    add(bm.slice(0, K_BM25).filter((x) => x.score > 0), "bm25");
    const hits = [...m.values()].map((e) => {
      const rrf = (e.vectorRank ? 1 / (RRF_K + e.vectorRank) : 0) + (e.bm25Rank ? 1 / (RRF_K + e.bm25Rank) : 0);
      const method = e.vector != null && e.bm25 != null ? "both" : e.vector != null ? "vector" : "bm25";
      const d = docs[e.i];
      return { id: d.id, text: d.text, url: d.url, section: d.section, cosine: e.vector ?? cos(qv, d.vector), bm25: e.bm25 ?? 0, method, rrf };
    }).sort((a, b) => b.rrf - a.rrf);
    const maxCos = Math.max(...hits.map((h) => h.cosine));
    const maxBm25 = hits.length ? Math.max(...hits.map((h) => h.bm25)) : 0;
    const strong = maxBm25 >= BM25_MIN;
    return { hits, weak: maxCos < THRESHOLD && !strong, refuse: maxCos < REFUSE && !strong, maxCos };
  };
}

async function geminiJudge(query, answer, hits) {
  const context = hits.slice(0, 6).map((h) => `[${h.id}] ${h.text}`).join("\n");
  const sys = "당신은 RAG 답변을 평가하는 채점자입니다. 자료·질문·답변을 읽고 아래 6개 기준을 JSON으로만 출력하세요. 다른 말은 하지 마세요.";
  const rubric = [
    "기준(true/false):",
    "- grounded: 답변 내용이 자료 안에 근거가 있으면 true",
    "- noHalluc: 자료에 없는 사실(기관명·전화번호·URL·숫자)을 지어내지 않았으면 true",
    "- cited: 답변에 [ID] 형식 근거 표시가 있으면 true (거부 답변이면 없어도 true)",
    "- refusal: 답변이 '안내 범위 밖' 등으로 정중히 거부했으면 true",
    "- score: 0~100 정수, comment: 한국어 한 문장 평가",
    "refusal이 true이면 grounded/noHalluc/cited는 관대하게 봅니다.",
    '반드시 {"grounded":bool,"noHalluc":bool,"cited":bool,"refusal":bool,"score":int,"comment":"..."} 형식만 출력.',
  ].join("\n");
  const user = `${rubric}\n\n[자료]\n${context}\n\n[질문] ${query}\n\n[답변] ${answer}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: `${sys}\n\n${user}` }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 6000));
    const r = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const data = await r.json();
      const txt = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const p = JSON.parse(txt.replace(/```json|```/g, "").trim());
      return { grounded: !!p.grounded, noHalluc: !!p.noHalluc, cited: !!p.cited, refusal: !!p.refusal, score: Number(p.score) || 0, comment: String(p.comment ?? "") };
    }
    if (r.status === 429) {
      lastErr = new Error(`429 rate limit (시도 ${attempt}/5)`);
      process.stdout.write(`  [429 재시도 ${attempt}/5 대기 6초...]\n`);
      continue;
    }
    throw new Error(`Gemini judge 실패 ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  throw lastErr;
}

async function main() {
  const docs = JSON.parse(await readFile(new URL("./senior-docs.json", import.meta.url)));
  const search = buildSearcher(docs);
  const prev = JSON.parse(await readFile(new URL("./eval-results.json", import.meta.url)));
  const compared = [];
  let scoreDiffSum = 0, agreeScore6 = 0, agreeTrue = 0, trueTotal = 0;
  for (const item of prev) {
    process.stdout.write(`\n[${item.type}] ${item.question}\n`);
    const res = await search(item.question);
    const hits = item.refuse ? [] : res.hits.slice(0, 6);
    const gj = await geminiJudge(item.question, item.answer, hits);
    const lj = item.judge;
    const scoreDiff = Math.abs(gj.score - lj.score);
    scoreDiffSum += scoreDiff;
    agreeScore6 += scoreDiff <= 6 ? 1 : 0;
    for (const f of ["grounded", "noHalluc", "cited", "refusal"]) {
      if (gj[f] === lj[f]) agreeTrue++; trueTotal++;
    }
    console.log(`  로컬 ${lj.score}점 | Gemini ${gj.score}점 (차이 ${scoreDiff >= 0 ? "+" : ""}${scoreDiff})`);
    console.log(`  로컬 judges: g=${lj.grounded} h=${lj.noHalluc} c=${lj.cited} r=${lj.refusal}`);
    console.log(`  Gemini judges: g=${gj.grounded} h=${gj.noHalluc} c=${gj.cited} r=${gj.refusal}`);
    compared.push({ type: item.type, question: item.question, weak: item.weak, refuse: item.refuse, local: lj, gemini: gj, scoreDiff });
    await new Promise((r) => setTimeout(r, 2000));
  }
  const n = compared.length;
  const avg = Math.round(compared.reduce((s, r) => s + r.gemini.score, 0) / n);
  const avgLocal = Math.round(compared.reduce((s, r) => s + r.local.score, 0) / n);
  const avgDiff = +(scoreDiffSum / n).toFixed(1);
  const agreeRate = Math.round((agreeScore6 / n) * 100);
  const agreeFlagRate = Math.round((agreeTrue / trueTotal) * 100);
  console.log(`\n===== judge 이중화 비교 요약 (${n}문항) =====`);
  console.log(`로컬 평균 ${avgLocal} | Gemini 평균 ${avg} | 평균 |점수차| ${avgDiff}`);
  console.log(`score 차이 <=6점 비율: ${agreeRate}%`);
  console.log(`판정 플래그 4종 일치율: ${agreeFlagRate}%`);
  await writeFile(new URL("./eval-results-gemini.json", import.meta.url), JSON.stringify({ summary: { n, avgLocal, avgGemini: avg, avgScoreDiff: avgDiff, agreeScore6pct: agreeRate, agreeFlagPct: agreeFlagRate }, rows: compared }, null, 2));
  console.log("결과가 eval-results-gemini.json에 저장되었습니다.");
}

main().catch((e) => { console.error(e); process.exit(1); });