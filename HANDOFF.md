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
- 히스토리 비밀값 점검: 키 형태 문자열 0건, `.env`·키파일 커밋 이력 없음 → 퍼블릭 전환 완료
- 배포 게시 확인(2026-08-30): index.html·assets·senior-docs.json(15건/768차원)·demo.json·이미지 전부 200
- CORS 실측: `Access-Control-Allow-Origin: https://nike1137-svg.github.io` 응답 확인

### 마무리 보완 (2026-08-30)
- **예시 미리보기**: Ollama 미설치 방문자가 미연결 배너만 보고 결과물을 전혀 확인할 수 없던 문제 해결.
  `make-demo.mjs`로 실제 파이프라인을 돌려 `app/public/demo.json`에 기록(도메인내 1건 + 도메인밖 거절 1건).
  버튼을 누르면 기존 UI(인용 표시·출처 칩·원문 모달·판정 배지)에 그대로 올라가고 예시임을 명시한다.
  지어낸 값이 아니라 실행 기록이며 eval.mjs와 같은 설정을 쓴다.
- **직접 `ollama serve` 안내**: 공식 설치 스크립트를 쓰지 않으면 `ollama.service`가 없어
  `systemctl restart ollama`가 실패한다. 배너와 README 양쪽에 대체 명령을 추가했다.
- **원격 주소를 SSH로 전환**: HTTPS라 push 때마다 비밀번호를 묻고 실패했다.
  `github_nike1137`·`github_gh_nopass` 두 키 모두 nike1137-svg로 인증되는 것을 확인하고 SSH로 바꿨다.

### 아키텍처 결정 — 브라우저 임베딩으로 되돌리지 않은 이유
참조 구현(모두콘 예시)은 임베딩을 브라우저에서 해 Ollama 모델이 1개면 되지만, 이 프로젝트는 2개가 필요하다.
전환을 검토했으나 하지 않기로 했다. 퀘스트 조건이 "미리 계산해 정적 파일로 배치해도 됩니다"로 양쪽을 허용하고,
절약되는 용량이 embeddinggemma 0.62GB뿐이며(qwen3.5:2b가 2.74GB), 무엇보다
**THRESHOLD 0.33·BM25_MIN 6.0이 embeddinggemma의 코사인 분포를 실측해 뽑은 값이라
임베딩 경로를 바꾸면 실험 기록 전체가 재측정 대상이 된다.** 대신 예시 미리보기로 접근성을 확보했다.

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

없음. 제출 준비 완료 상태다.

- GitHub 저장소: https://github.com/nike1137-svg/Rag_guide_chatbot (퍼블릭)
- 배포 URL: https://nike1137-svg.github.io/Rag_guide_chatbot/ (게시 확인)
- 제출 폼: https://forms.gle/1BMsytrwzN5uscNA6

미확인 1건: 배포 화면에서 예시 버튼 두 개를 눌렀을 때의 렌더링을 눈으로 확인하지 못했다.
데이터 경로(demo.json 200)와 빌드 포함은 확인됨.

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
