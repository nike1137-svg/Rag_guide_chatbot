// 접두어 있음/없음 임베딩 분리도 비교 (senior-docs.json 안 건드림)
import { readFileSync } from "node:fs";
const OLLAMA = "http://localhost:11434/api/embed", MODEL = "embeddinggemma";
const src = JSON.parse(readFileSync("senior-docs.source.json", "utf-8"));
async function emb(t) {
  const r = await fetch(OLLAMA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, input: t }) });
  return (await r.json()).embeddings[0];
}
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; } return d/Math.sqrt(na*nb); }
function top(qv, docs) { return docs.map(d => ({ id: d.id, s: cos(qv, d.v) })).sort((a,b)=>b.s-a.s)[0]; }
const docsA = [], docsB = [];
for (const d of src) { docsA.push({ id: d.id, v: await emb("title: none | text: " + d.text) }); docsB.push({ id: d.id, v: await emb(d.text) }); }
const queries = ["교육비가 드나요?", "어디에 문의하나요?", "키오스크 사용법도 배울 수 있나요?", "오늘 서울 날씨 알려줘"];
console.log("질문                          접두어O          접두어X");
for (const q of queries) {
  const tA = top(await emb("task: search result | query: " + q), docsA);
  const tB = top(await emb(q), docsB);
  console.log(`${q.padEnd(26)} ${tA.s.toFixed(3)} ${tA.id}   ${tB.s.toFixed(3)} ${tB.id}`);
}
