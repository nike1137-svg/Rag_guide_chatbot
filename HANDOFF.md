# RAG 가이드 챗봇 — 진행 상황 (Handoff)

업데이트: 2026-08-29 (오픈코드 인수인계 — 문서 정합성 보완 완료 시점)

## 프로젝트 개요
- 메인퀘스트3: 모두콘 RAG 가이드 챗봇 만들기
- 도메인: 어르신 디지털·스마트폰 이용 안내
- 실행 모델: qwen3.5:2b (Ollama, 로컬)
- 임베딩 모델: embeddinggemma (Ollama, 접두어 없이 raw text로 임베딩)
- 배포: GitHub Pages(정적), 임베딩 생성만 로컬 Ollama 위임 — 완전 무료 구성
- marcus-desktop 경로: ~/projects/Rag_guide_chatbot/

## 완료된 것 (실습 1~7 + 인수인계 보완)
1. PRD.md — 도메인/목표/비목표/수용기준(6필드+수동2)/설계메모/피드백기능. **임계값 0.33·실행조건·임베딩 준비율 등 실제 구현값 반영 완료(2026-08-29)**
2. 근거자료 15개 (senior-docs.source.json, SD-001~SD-015: 디지털배움터 1~11 + 보이스피싱·스미싱·무인민원발급기·정부24)
3. 임베딩: Ollama embeddinggemma, 768차원, senior-docs.json (app/public/에 사본)
4. 하이브리드 검색: rag.ts buildSearcher() — 코사인(top-10) + BM25 바이그램(top-5) + RRF(k=60)
5. 임계값: THRESHOLD=0.33(weak), REFUSE=0.30(거부), BM25_MIN=6.0 (원안 0.55는 모델 교체 후 실측 재조정; BM25_MIN 최초 2.0 → 도메인밖 우연매칭 취약점 실측 후 6.0)
6. 프롬프트/스트리밍: buildPrompt(), chatStream()(stream:true, think:false), 한국어 전용 강제
7. React UI(App.tsx): 상태배지, 질문/중지, weak경고, 출처칩, 좋아요/싫어요, 자동판정 버튼+6필드
8. LLM-as-a-Judge: rag.ts judge() — grounded/noHalluc/cited/refusal/score/comment (format:"json", temperature:0)
9. 평가: eval.mjs, 질문 30개(도메인내20/애매4/도메인밖6), 평균 80/100, eval-results.json
10. 배포: GitHub Pages → https://nike1137-svg.github.io/Rag_guide_chatbot/ (`npm run deploy`로 갱신), OLLAMA_ORIGINS 설정
11. README.md — 소개/실행전제/아키텍처/임계값설계/실험기록 8건/한계/배포주소. 검색 진행 표시를 하나로 합친 설계 이유 명시
12. THRESHOLD 0.40 A/B 실험(2026-08-29) — 판정 변화 0건(현 질문세트는 maxCos 0.33~0.40 구간 문항 0개), 점수 변화는 비결정성 노이즈 → **0.33 유지 결정**

## 확인된 이슈·관찰
- qwen3.5:2b(중국계) → 시스템프롬프트 "한국어만" 강제, 간헐적 중국어 누출 잔존(0.40 실험에서도 재확인)
- 임베딩 접두어(title/task) 붙이면 분리도 저하 → 접두어 제거
- judge 자기모순: "교육비가 드나요?"에서 score=100인데 noHalluc=false (인용 표시 누락 + 2B 소형모델 일관성 부족, 실제 환각 아님)
- **eval.mjs · chatStream의 chat()은 temperature 미지정(Na)이라 실행마다 답변이 달라짐(비결정성)** → A/B 실험 해석 시 점수 차이를 랜덤 노이즈로 감안 필요

## 파일 구조
- PRD.md / README.md / HANDOFF.md / senior-docs.source.json(원본 15개) / senior-docs.json(임베딩 완료 벡터스토어)
- embed-docs.mjs / check_retrieval.mjs / hybrid_search.mjs / compare_prefix.mjs (실험·빌드 스크립트)
- eval.mjs / eval-results.json (정식 평가) + **eval_ab_040.mjs / eval-results-040.json (0.40 A/B 실험 산출물, 보존)**
- app/ (Vite + React + TS): src/rag.ts, src/App.tsx, public/senior-docs.json

## 남은 작업 (지시서 7번, 우선순위 순)
1. [선택] 심화 실험 — "한 바퀴에 변수 하나" 규칙으로 하나씩: top-k(5/10/20), 프롬프트 문구 A/B, temperature(0/0.3/0.7), 모델 크기(0.8b/2b/4b). (임계값 A/B는 0.40 실험으로 이미 1건 완료)
2. [승인 필수] judge 이중화(로컬 qwen3.5:2b ↔ Gemini API) — Gemini는 유료 가능성 있음 → 반드시 무료 한도·과금 조건 사전 확인 후 승인받기
3. [낮음] UI/디자인 개선 — 가벼운 CSS(여백·색상·카드형)만, 화려한 리디자인은 보류 상태
4. [범위 밖] LINE 챗봇(어르신용)·자체 에이전트 등 타 프로젝트 연동은 별도 논의

## 재개 방법 (다른 세션·도구에서 이어갈 때)
1. 이 저장소 그대로 사용. `git log --oneline`으로 최근 커밋과 이 문서의 "완료된 것" 대조
2. Ollama 실행 필요: `ollama serve`(백그라운드), 모델 qwen3.5:2b / embeddinggemma
3. `cd app && npm run dev` → http://localhost:5173
4. 평가 재현: `node eval.mjs` (30문항, 평균 산출, eval-results.json 갱신)
5. 위 "남은 작업" 순서대로 진행

## 반드시 지킬 원칙
- 임계값을 낮추지 말고 "신호(척도)를 높이는" 방향으로 문제 해결
- 임계값·검색 파라미터 변경 시 **eval.mjs 30문항 재검증("어긋난 질문" 0개) 필수**
- A/B 실험은 원본 스크립트 보존 후 사본으로 실행, "한 바퀴에 변수 하나", 산출물은 커밋
- 파일 덮어쓰기 전 백업, 오류 시 즉시 삭제 → 확인 → 재작업
- 새 API(Gemini 등)·패키지 도입 전 유료 플랜·한도·자동과금 확인 필수 (현재까지 전부 로컬/무료)