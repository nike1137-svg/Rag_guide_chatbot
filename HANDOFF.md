# RAG 가이드 챗봇 — 진행 상황 (Handoff)

업데이트: 2026-08-28 (실습7 judge UI 완료 시점)

## 프로젝트 개요
- 메인퀘스트3: 모두콘 RAG 가이드 챗봇 만들기
- 도메인: 어르신 디지털·스마트폰 이용 안내
- 실행 모델: qwen3.5:2b (Ollama, 로컬)
- 임베딩 모델: embeddinggemma (Ollama, 접두어 없이 raw text로 임베딩)
- 배포 목표: GitHub Pages(정적), 임베딩/검색은 브라우저, 답변생성은 로컬 Ollama — 완전 무료 구성
- marcus-desktop 경로: ~/projects/Rag_guide_chatbot/

## 완료된 것 (실습 1~7)
1. PRD.md 작성 완료 (도메인/목표/비목표/근거자료후보/수용기준/설계메모/피드백기능)
2. 근거자료 15개 (senior-docs.source.json, SD-001~SD-015: 디지털배움터 1~9 + 보이스피싱·스미싱·무인민원발급기·정부24 12~15)
3. 임베딩 완료: embed-docs.mjs → Ollama embeddinggemma, 768차원, senior-docs.json 생성 (app/public/에도 복사됨)
4. 하이브리드 검색: rag.ts buildSearcher() — 코사인(top10) + BM25 바이그램(top5) + RRF(k=60)
5. 임계값: THRESHOLD=0.33(weak), REFUSE=0.30(거부), BM25_MIN=2.0(BM25 강하면 weak/refuse 해제)
6. 프롬프트: buildPrompt() — [ID]인용, 지어내지않기, 쉬운설명, weak시 조심스럽게, 한국어전용 강제, 범위밖 거부
7. 스트리밍 답변: chatStream() (Ollama /api/chat, stream:true, think:false)
8. React UI(App.tsx, 108줄): 상태배지, 질문/중지, weak경고, 출처칩, 좋아요/싫어요, **자동판정(judge) 버튼 + 6필드 표시** — 방금 완료, 브라우저 테스트 통과
9. LLM-as-a-Judge: rag.ts judge() — grounded/noHalluc/cited/refusal/score/comment (format:"json", temperature:0)
10. GitHub 저장소 연결, 기존 커밋/푸시 이력 있음

## 확인된 이슈·관찰 (README 실험기록에 옮길 것)
- qwen3.5:2b가 중국계 모델이라 한자/중국어 누출 위험 → 시스템프롬프트에 "한국어만" 강제로 해결
- 임베딩에 접두어(title/task) 붙이면 분리도 저하 → 접두어 제거로 해결 (compare_prefix.mjs 실험)
- BM25로 강하게 매칭되는데 코사인이 낮아 weak 오판 → BM25_MIN 가드 추가로 해결 (임계값을 낮추지 않고 신호를 높이는 방향)
- judge 필드 자기모순 관찰: "교육비가 드나요?" 테스트에서 score=100인데 noHalluc=false로 나옴. 원본 대조 결과 실제 환각은 아니었음(SD-002 "체험관" 언급이 실재) — 인용표시 누락 + 소형 judge 모델의 자기일관성 부족으로 추정.

## 파일 구조
- PRD.md, senior-docs.source.json(원본 15개), senior-docs.json(임베딩 완료 벡터스토어)
- embed-docs.mjs / check_retrieval.mjs / hybrid_search.mjs / compare_prefix.mjs (실험·빌드 스크립트)
- app/ (Vite + React + TS)
  - src/rag.ts (128줄): embed, buildSearcher, buildPrompt, chatStream, checkOllama, judge
  - src/App.tsx (108줄): UI, judge 버튼/6필드 결과 표시 포함
  - public/senior-docs.json: 앱이 fetch하는 벡터스토어 사본

## 남은 작업 (우선순위 순)
1. 실습7 "더 깊이": 변수 하나(top-k/임계값/프롬프트 문구 중 1개)만 바꿔 점수 변화를 README.md에 기록
2. eval.mjs: 질문 세트로 일괄 채점하는 스크립트 작성 (judge 함수 재사용)
3. 평가용 질문 세트 작성 (도메인내/도메인밖/애매 질문 모음, 아직 미작성)
4. "더 깊이 갈 사람을 위한 길" 심화 트랙 (엔진 비교, 양자화, top-k/RRF 조정, prompt A-B, judge 이중화 등) — 선택, 시간 되는 만큼
5. #9 제출 준비: GitHub Pages 배포, README.md(서비스소개/실행전제/실험기록/배포주소), PRD.md 최종본
6. 실습6 정식 문서화: 도메인밖/근거부족/애매 질문 테스트 결과 README에 정리

## 재개 방법 (다른 세션·도구에서 이어갈 때)
1. 이 저장소 clone 또는 marcus-desktop의 ~/projects/Rag_guide_chatbot/ 그대로 사용
2. `git log --oneline`으로 최근 커밋과 이 문서의 "완료된 것" 대조
3. Ollama 로컬 실행 필요: `ollama serve` 백그라운드, 모델 qwen3.5:2b / embeddinggemma
4. `cd app && npm run dev` → http://localhost:5173
5. 위 "남은 작업" 순서대로 진행

## 반드시 지킬 원칙
- 임계값을 낮추지 말고 "신호(척도)를 높이는" 방향으로 문제 해결
- 파일 작성은 작은 블록(2개 권장)으로 나눠 붙여넣고 매번 md5로 검증
- 오류 발생시 즉시 삭제 → 확인 → 재작업 (오류 상태에서 바로 재시도 금지)
- 메인퀘스트3 지침(교재 캡쳐) + "더 깊이 갈 사람을 위한 길"(1,3,4,5,6,7,8장) 모두 진행 대상
- 새 프로그램·API 사용 전 비용(무료 플랜/한도/자동과금) 확인 필수 — 현재까지 전부 로컬/무료 구성
