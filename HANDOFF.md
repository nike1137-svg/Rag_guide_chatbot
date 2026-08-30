# 이음이 — 진행 상황 (Handoff)

업데이트: 2026-08-30 (UI·문서 보강 완료, 배포·푸시 대기 시점)

## 프로젝트 개요
- 메인퀘스트3: "내 도메인에서 더 잘 대답해주는 RAG 챗봇 만들기"
- 도메인: 어르신 디지털·스마트폰 이용 안내 (서비스명 이음이)
- 답변 모델: qwen3.5:2b (Ollama, 로컬, temperature 0.3)
- 임베딩 모델: embeddinggemma (Ollama, 접두어 없이 raw text, 768차원)
- 배포: GitHub Pages(정적) — 브라우저가 사용자 컴퓨터의 Ollama를 직접 호출하는 구조
- marcus-desktop 경로: ~/projects/Rag_guide_chatbot/

## 완료된 것

### 파이프라인 (실습 1~7)
1. 근거자료 15건 (`senior-docs.source.json`, SD-001~SD-015) — 최소 121자, URL·section 전부 보존
2. 임베딩: Ollama embeddinggemma 768차원 → `senior-docs.json` (`app/public/`에 사본)
3. 하이브리드 검색: `rag.ts buildSearcher()` — 코사인(top-10) + BM25 바이그램(top-5) + RRF(k=60)
4. 임계값: THRESHOLD=0.33(weak), REFUSE=0.30(거절), BM25_MIN=6.0
5. 프롬프트/스트리밍: `buildPrompt()`, `chatStream()` (stream:true, think:false, temperature 0.3), 한국어 전용 강제
6. LLM-as-a-Judge: `rag.ts judge()` — grounded/noHalluc/cited/refusal/score/comment (format:"json", temperature:0)
7. 평가: `eval.mjs`, 질문 30개(도메인내 20 / 애매 4 / 도메인밖 6), 평균 85.6

### 실험 13건 (README 표 참고)
temperature 0.3 채택, top-k 10 유지, THRESHOLD 0.33 유지, BM25_MIN 2.0→6.0 상향, 모델 2b 유지, judge 이중화(로컬 vs Gemini 3.1 Flash-Lite) 비교까지 완료.

### UI·문서 보강 (2026-08-30, 커밋 f5e1ed1)
- **연결 상태 칩과 미연결 배너**: 브라우저 확인 → `ollama serve`/`pull` → OS별 `OLLAMA_ORIGINS`(복사 버튼) → "다시 확인" 재시도
- **스트리밍 중지 버튼** (AbortController가 생성만 되고 취소 UI가 없던 문제 해결)
- **답변 본문 `[SD-000]` 인용 표시 복원** — 화면에서 지우던 것을 칩 형태로 강조. TTS에서만 제거
- **출처 칩에 ID·섹션·검색방법·코사인 유사도 표시**, 클릭 시 근거 원문 조각·BM25 점수·원문 링크 모달
- **판정 배지 의미 구분** — refusal:false인 정상 답변을 실패로 칠하던 문제 수정, refusal:true면 나머지 3필드는 "제외"
- **랜딩 3섹션**(서비스 소개·근거 원칙·실행 구조)
- **이미지 절대경로 404 수정** — `import.meta.env.BASE_URL` 사용
- **빌드 에러 해소** — `status` 미사용 TS6133으로 `npm run build`가 실패하던 상태를 배지 구현으로 해결
- 이모지 제거 후 인라인 SVG로 교체, 반응형 레이아웃
- README: 사용 전 준비(OS별 CORS), 화면 기능표, 청크 스키마표, 루브릭 목표값/현재값표, 실험 13건 표, **실패 사례와 원인 단계(검색/생성/판정) 표**, 음성입력이 Google 서버를 경유한다는 한계 명시
- PRD: 문제 정의 / 타겟 유저 / 핵심 기능(MVP) / 화면 구성 / 근거 자료 계획 / 배포 후 점검 기준 추가

## 검증 기록 (2026-08-30)
- `npm run build` 통과 (tsc + vite)
- 프로덕션 빌드 자산 검증(`vite preview`): index.html이 `/Rag_guide_chatbot/` base로 참조하고, js·css·senior-docs.json·eoum-full.png·eoum-ui.png·favicon.svg **6종 모두 200**
- 화면 동작: 랜딩·연결 칩·FAQ·스트리밍·중지 버튼 전환·출처 칩(`SD-004 교육 비용 의미+낱말 유사도 0.60` 형태) 확인
- Ollama를 내린 상태에서 **미연결 배너와 복구 안내가 자동 노출되는 것** 확인
- 히스토리 비밀값 점검: 키 형태 문자열 0건, `.env`·키파일 커밋 이력 없음 → **퍼블릭 전환 가능**

## 확인된 이슈·관찰
- qwen3.5:2b(중국계) → 시스템프롬프트 "한국어만" 강제, 간헐적 중국어 누출 잔존
- judge 자기모순: noHalluc=false가 30문항 중 18건이나 원문 대조 결과 실제 환각 아님 (2B 소형모델 편향, 실험 13에서 Gemini 대비 실측)
- judge가 정당한 거절(도메인밖)에 낮은 점수를 줌 — 거절 동작 자체는 6/6 정상
- `eval.mjs`·`chatStream`의 답변 생성에 비결정성이 있어 A/B 점수 차이는 노이즈를 감안해야 함

## 파일 구조
- `PRD.md` / `README.md` / `HANDOFF.md`
- `senior-docs.source.json`(원본 15개) / `senior-docs.json`(임베딩 벡터스토어)
- `embed-docs.mjs` / `check_retrieval.mjs` / `hybrid_search.mjs` / `compare_prefix.mjs`
- `eval.mjs` + `eval-results.json` (정식 평가), `eval_*.mjs` + `eval-results-*.json` (A/B 실험 산출물, 보존)
- `design-mockups/` (사례분석 12건 + 시안 3종)
- `app/` (Vite + React + TS): `src/rag.ts`, `src/App.tsx`, `src/index.css`, `public/`

## 남은 작업
1. **원격 푸시** — 로컬이 origin/main보다 7커밋 앞서 있음. 이 기기에 GitHub 자격증명이 없어(`git ls-remote` 실패) 마커스님이 인증 후 push 필요
2. **Pages 재배포** — `cd app && npm run deploy` (빌드는 이미 통과 상태)
3. **저장소 퍼블릭 전환** — 무료 플랜은 비공개 저장소에서 Pages가 게시되지 않음. 전환 후 Pages 설정 확인하고 **배포 주소를 직접 열어 확인**
4. **배포 주소에서 수용 기준 재확인** — PRD "수용 기준 — 배포 후 점검" 4항목(자산 로드 / CORS 후 스트리밍 / FAQ 5개 중 근거 있는 답변 4개 이상 / 도메인밖 거절 1건 이상)
5. **과제 제출** — GitHub 저장소 URL + 배포 URL

## 재개 방법
1. `git log --oneline`으로 최근 커밋과 이 문서의 "완료된 것" 대조
2. Ollama 실행: `ollama serve`, 모델 qwen3.5:2b / embeddinggemma
3. `cd app && npm run dev` → http://localhost:5173/Rag_guide_chatbot/
4. 평가 재현: `node eval.mjs` (30문항, `eval-results.json` 갱신)

## 반드시 지킬 원칙
- 임계값을 낮추지 말고 "신호(척도)를 높이는" 방향으로 문제 해결
- 임계값·검색 파라미터 변경 시 **eval.mjs 30문항 재검증("어긋난 질문" 0개) 필수**
- A/B 실험은 원본 스크립트 보존 후 사본으로 실행, "한 바퀴에 변수 하나", 산출물은 커밋
- 파일 덮어쓰기 전 백업, 오류 시 즉시 삭제 → 확인 → 재작업
- 새 API·패키지 도입 전 유료 플랜·한도·자동과금 확인 필수 (현재까지 전부 로컬/무료, Gemini judge 실험만 무료 티어 사용)
