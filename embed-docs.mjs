// Ollama 임베딩으로 문서 벡터스토어 생성
// 실행: node embed-docs.mjs   (Ollama 데몬 + embeddinggemma 필요)
import { readFileSync, writeFileSync } from "node:fs";

const OLLAMA = "http://localhost:11434/api/embed";
const MODEL = "embeddinggemma";
const DOC_PREFIX = "title: none | text: "; // embeddinggemma 문서 접두어
const SRC = "senior-docs.source.json";
const OUT = "senior-docs.json";

async function embed(text) {
  const res = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.embeddings[0];
}

const docs = JSON.parse(readFileSync(SRC, "utf-8"));
const out = [];
for (const d of docs) {
  const vector = await embed(DOC_PREFIX + d.text);
  out.push({ id: d.id, text: d.text, url: d.url, section: d.section, vector });
  console.log(`${d.id} → ${vector.length}차원`);
}
writeFileSync(OUT, JSON.stringify(out));
const dim = out[0].vector.length;
console.log(`\n완료: ${out.length}개 청크 → ${OUT}`);
if (dim !== 768) console.error(`⚠️ 경고: 768이 아니라 ${dim}차원`);
else console.log("✅ 768차원 확인");
