// eval.mjs — 평가 질문 세트로 RAG 파이프라인을 일괄 실행하고 LLM-as-a-Judge로 채점
import { readFile, writeFile } from "node:fs/promises";

const OLLAMA = "http://localhost:11434";
const EMBED_MODEL = "embeddinggemma";
const CHAT_MODEL = "qwen3.5:2b";
const THRESHOLD = 0.33;
const REFUSE = 0.30;
const BM25_MIN = 2.0;
const K_VEC = 10, K_BM25 = 5, RRF_K = 60;
const REFUSAL_MSG = "죄송합니다. 이 질문은 안내 범위 밖이거나 자료에 근거가 없어 정확히 답변드리기 어렵습니다. 디지털배움터 이용, 보이스피싱·스미싱 예방, 무인민원발급기·정부24 이용 등에 대해 물어봐 주세요.";

const QUESTIONS = [
  { q: "보이스피싱이 의심되면 어디로 신고해요?", type: "in" },
  { q: "스미싱 문자를 받으면 어떻게 해야 하나요?", type: "in" },
  { q: "무인민원발급기로 뭘 발급받을 수 있어요?", type: "in" },
  { q: "정부24에서 등본을 발급받으면 수수료가 드나요?", type: "in" },
  { q: "디지털배움터 교육은 누가 운영하나요?", type: "in" },
  { q: "디지털배움터 교육비가 드나요?", type: "in" },
  { q: "디지털배움터는 어디서 신청해요?", type: "in" },
  { q: "고령층도 AI 교육을 받을 수 있나요?", type: "in" },
  { q: "집 근처에서 스마트폰 앱 사용법을 배울 수 있나요?", type: "in" },
  { q: "배움터에 직접 가기 어려우면 어떻게 하나요?", type: "in" },
  { q: "우리 동네에 배움터가 몇 개 있어요?", type: "ambiguous" },
  { q: "디지털배움터 문의 전화번호가 뭐예요?", type: "ambiguous" },
  { q: "오늘 날씨 어때요?", type: "out" },
  { q: "손주 생일 선물로 뭐가 좋을까요?", type: "out" },
  { q: "지금 코스피 지수가 얼마예요?", type: "out" },
];

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

function buildPrompt(query, hits, weak) {
  const context = hits.slice(0, 6).map((h) => `[${h.id}] (${h.section}) ${h.text}\n출처: ${h.url}`).join("\n\n");
  const system = [
    "당신은 어르신 디지털·스마트폰 안내 도우미입니다. 아래 '자료'에 근거해서만 한국어 존댓말로 답하세요. 반드시 한국어로만 쓰고 한자나 중국어, 불필요한 영어 단어를 쓰지 마세요.",
    "규칙:",
    "1. 답변에 사용한 근거의 [ID]를 문장 뒤에 표시하세요. 예: ...입니다 [SD-004].",
    "2. 자료에 없는 내용(기관명·전화번호·URL·숫자)을 지어내지 마세요.",
    "3. 어려운 용어는 풀어서 쉽게 설명하세요.",
    weak ? "4. 지금은 근거가 약합니다. 단정하지 말고 '정확한 내용은 확인이 필요합니다'라고 조심스럽게 답하세요." : "4. 근거가 충분하면 명확히 답하세요.",
    "5. 자료 범위 밖 질문이면 지어내지 말고 '안내 범위 밖입니다'라고 정중히 알리세요.",
  ].join("\n");
  const user = `자료:\n${context}\n\n질문: ${query}`;
  return { system, user };
}

async function chat(system, user) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CHAT_MODEL, stream: false, think: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`채팅 실패 ${r.status}`);
  const data = await r.json();
  return data.message.content;
}

async function judge(query, answer, hits) {
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
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CHAT_MODEL, stream: false, think: false, format: "json", options: { temperature: 0 }, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`judge 실패 ${r.status}`);
  const data = await r.json();
  const p = JSON.parse(data.message.content);
  return { grounded: !!p.grounded, noHalluc: !!p.noHalluc, cited: !!p.cited, refusal: !!p.refusal, score: Number(p.score) || 0, comment: String(p.comment ?? "") };
}

async function main() {
  const docs = JSON.parse(await readFile(new URL("./senior-docs.json", import.meta.url)));
  const search = buildSearcher(docs);
  const results = [];
  for (const { q, type } of QUESTIONS) {
    process.stdout.write(`\n[${type}] ${q}\n`);
    const res = await search(q);
    let answer, hits;
    if (res.refuse) {
      answer = REFUSAL_MSG; hits = [];
    } else {
      hits = res.hits.slice(0, 6);
      const { system, user } = buildPrompt(q, res.hits, res.weak);
      answer = await chat(system, user);
    }
    console.log("  답변:", answer.slice(0, 80).replace(/\n/g, " ") + (answer.length > 80 ? "..." : ""));
    const j = await judge(q, answer, hits);
    console.log(`  판정: grounded=${j.grounded} noHalluc=${j.noHalluc} cited=${j.cited} refusal=${j.refusal} score=${j.score}`);
    results.push({ type, question: q, weak: res.weak, refuse: res.refuse, maxCos: res.maxCos, answer, judge: j });
  }
  await writeFile(new URL("./eval-results.json", import.meta.url), JSON.stringify(results, null, 2));
  const avg = Math.round(results.reduce((s, r) => s + r.judge.score, 0) / results.length);
  console.log(`\n===== 평균 점수: ${avg}/100 (질문 ${results.length}개) =====`);
  console.log("결과가 eval-results.json에 저장되었습니다.");
}

main().catch((e) => { console.error(e); process.exit(1); });
