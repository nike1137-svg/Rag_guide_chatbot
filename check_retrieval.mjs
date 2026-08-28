// 검색 스팟체크: 질문을 Ollama로 임베딩해 상위 근거 확인
// 실행: node check_retrieval.mjs   (senior-docs.json 필요)
import { readFileSync } from "node:fs";

const OLLAMA = "http://localhost:11434/api/embed";
const MODEL = "embeddinggemma";
const Q_PREFIX = "task: search result | query: "; // embeddinggemma 질문 접두어
const docs = JSON.parse(readFileSync("senior-docs.json", "utf-8"));

async function embed(t) {
  const r = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: t }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).embeddings[0];
}

function cos(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

const queries = [
  "디지털 교육은 누가 들을 수 있나요?",
  "교육비가 드나요?",
  "어디에 문의하나요?",
  "키오스크 사용법도 배울 수 있나요?",
  "오늘 서울 날씨 알려줘",
];

for (const q of queries) {
  const qv = await embed(Q_PREFIX + q);
  const ranked = docs
    .map((d) => ({ id: d.id, section: d.section, score: cos(qv, d.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  console.log(`\n[Q] ${q}`);
  for (const r of ranked) console.log(`  ${r.score.toFixed(3)}  ${r.id}  ${r.section}`);
}
