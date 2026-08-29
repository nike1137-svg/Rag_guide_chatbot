import { useEffect, useRef, useState, useCallback } from "react";
import { buildSearcher, buildPrompt, chatStream, checkOllama, judge, type Doc, type Hit, type Judgement } from "./rag";

type Status = { ollama: boolean; chat: boolean; embed: boolean; docs: number };

const FAQ_ITEMS = [
  { text: "보이스피싱이 의심되면 어떻게 해야 하나요?", icon: "📞" },
  { text: "디지털배움터는 어떤 곳인가요?", icon: "💻" },
  { text: "무인민원발급기는 어떻게 사용하나요?", icon: "🖨️" },
  { text: "스미싱 문자가 왔는데 어떻게 하죠?", icon: "📱" },
  { text: "정부24는 어떤 서비스인가요?", icon: "🏛️" },
];

function stripCitations(text: string): string {
  return text
    .replace(/\s*\[SD-\d+(?:,\s*SD-\d+)*\]\s*/g, " ")
    .replace(/\s*\[SD-\d+\]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function BotAvatar() {
  return (
    <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#ffffff"/>
      <circle cx="50" cy="50" r="44" fill="#2d8a56"/>
      <circle cx="50" cy="44" r="18" fill="#ffe0b2"/>
      <circle cx="44" cy="42" r="2.5" fill="#1a1a1a"/>
      <circle cx="56" cy="42" r="2.5" fill="#1a1a1a"/>
      <circle cx="38" cy="47" r="3.5" fill="#ffccbc" opacity="0.5"/>
      <circle cx="62" cy="47" r="3.5" fill="#ffccbc" opacity="0.5"/>
      <path d="M44 50 Q50 55 56 50" stroke="#2d8a56" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M34 66 Q34 60 50 60 Q66 60 66 66 L68 82 Q68 88 50 88 Q32 88 32 82 Z" fill="#ffffff"/>
    </svg>
  );
}

function HeaderCharacter() {
  return (
    <svg width="72" height="72" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.15)"/>
      <circle cx="50" cy="50" r="44" fill="rgba(255,255,255,0.25)"/>
      <circle cx="50" cy="44" r="18" fill="#ffe0b2"/>
      <circle cx="44" cy="42" r="2.5" fill="#1a1a1a"/>
      <circle cx="56" cy="42" r="2.5" fill="#1a1a1a"/>
      <circle cx="38" cy="47" r="3.5" fill="#ffccbc" opacity="0.5"/>
      <circle cx="62" cy="47" r="3.5" fill="#ffccbc" opacity="0.5"/>
      <path d="M44 50 Q50 55 56 50" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M34 66 Q34 60 50 60 Q66 60 66 66 L68 82 Q68 88 50 88 Q32 88 32 82 Z" fill="rgba(255,255,255,0.9)"/>
    </svg>
  );
}

export default function App() {
  const [status, setStatus] = useState<Status>({ ollama: false, chat: false, embed: false, docs: 0 });
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [weak, setWeak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"" | "up" | "down">("");
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  const [judging, setJudging] = useState(false);
  const [largeFont, setLargeFont] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [recording, setRecording] = useState(false);
  const searcher = useRef<ReturnType<typeof buildSearcher> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("senior-docs.json").then((r) => r.json()).then((d: Doc[]) => {
      searcher.current = buildSearcher(d);
      setStatus((s) => ({ ...s, docs: d.length }));
    });
    checkOllama().then((o) => setStatus((s) => ({ ...s, ollama: o.ok, chat: o.hasChat, embed: o.hasEmbed })));
  }, []);

  useEffect(() => {
    if (answer && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [answer]);

  const ask = useCallback(async (q?: string) => {
    const queryText = q ?? query;
    if (!queryText.trim() || !searcher.current || busy) return;
    setBusy(true); setAnswer(""); setHits([]); setFeedback(""); setJudgement(null);
    try {
      const res = await searcher.current(queryText);
      setWeak(res.weak);
      if (res.refuse) {
        setHits([]);
        setAnswer("죄송합니다. 이 질문은 안내 범위 밖이거나 자료에 근거가 없어 정확히 답변드리기 어렵습니다. 디지털배움터 이용, 보이스피싱·스미싱 예방, 무인민원발급기·정부24 이용 등에 대해 물어봐 주세요.");
        return;
      }
      setHits(res.hits.slice(0, 6));
      const { system, user } = buildPrompt(queryText, res.hits, res.weak);
      abort.current = new AbortController();
      let acc = "";
      for await (const chunk of chatStream(system, user, abort.current.signal)) {
        acc += chunk;
        setAnswer(acc);
      }
    } catch (e) {
      setAnswer("오류: " + (e as Error).message);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }, [query, busy]);

  async function runJudge() {
    if (!answer || judging) return;
    setJudging(true);
    try {
      const j = await judge(query, answer, hits);
      setJudgement(j);
    } catch (e) {
      setJudgement({ grounded: false, noHalluc: false, cited: false, refusal: false, score: 0, comment: "판정 오류: " + (e as Error).message });
    } finally {
      setJudging(false);
    }
  }

  function speakAnswer() {
    if (!answer || !window.speechSynthesis) return;
    const clean = stripCitations(answer);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "ko-KR";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }
    if (recording && recognitionRef.current) {
      recognitionRef.current.stop();
      setRecording(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setRecording(false);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function handleFaqClick(item: string) {
    setQuery(item);
    ask(item);
  }

  const rootClasses = [
    largeFont ? "large-font" : "",
    highContrast ? "high-contrast" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClasses}>
      <div className="app-container">

        {/* 헤더 */}
        <header className="header">
          <div className="header-content">
            <div className="header-text">
              <h1 className="header-title">이음이</h1>
              <p className="header-subtitle">어르신의 일상과 디지털을 이어주는<br/>인공지능 안내자에요</p>
            </div>
            <div className="header-character">
              <HeaderCharacter />
            </div>
          </div>
        </header>

        {/* 접근성 툴바 */}
        <div className="a11y-bar">
          <button
            className={`a11y-btn ${largeFont ? "active" : ""}`}
            onClick={() => setLargeFont(!largeFont)}
          >
            A+ 큰글씨
          </button>
          <button
            className={`a11y-btn ${highContrast ? "active" : ""}`}
            onClick={() => setHighContrast(!highContrast)}
          >
            ◐ 고대비
          </button>
        </div>

        {/* 안내 메시지 */}
        <div className="guide-section">
          <div className="guide-bubble">
            <BotAvatar />
            <span className="guide-bubble-text">안녕하세요! 무엇을 도와드릴까요?</span>
          </div>
          <div className="guide-hint">
            <span className="guide-hint-icon">&#128161;</span>
            <span>궁금한 점을 입력하시거나 아래 질문을 눌러보세요. 쉽고 자세하게 알려드릴게요!</span>
          </div>
        </div>

        {/* 자주 묻는 질문 */}
        <div className="main-content">
          <div className="faq-section">
            <div className="faq-label">자주 묻는 질문</div>
            <div className="faq-list">
              {FAQ_ITEMS.map((item, idx) => (
                <button
                  key={idx}
                  className="faq-card"
                  onClick={() => handleFaqClick(item.text)}
                  disabled={busy}
                >
                  <span className="faq-icon">{item.icon}</span>
                  <span className="faq-text">{item.text}</span>
                  <span className="faq-arrow">&#8250;</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 채팅 영역 */}
        {!!answer && (
          <div className="chat-area" ref={chatEndRef}>
            {weak && (
              <div className="weak-warning">
                &#9888;&#65039; 근거가 약합니다 — 조심스러운 답변입니다
              </div>
            )}
            <div className="chat-message">
              <div className="chat-avatar">
                <BotAvatar />
              </div>
              <div className="chat-bubble chat-bubble-bot">
                {stripCitations(answer)}
              </div>
            </div>
            <div className="chat-actions">
              <button className="tts-btn" onClick={speakAnswer}>
                <span className="tts-icon">&#128266;</span>
                <span className="tts-text">듣기</span>
                <span className="tts-desc">답변을 음성으로 들을 수 있어요</span>
              </button>
            </div>
            {hits.length > 0 && (
              <div className="sources-section">
                <div className="sources-title">참고한 내용</div>
                <div className="sources-list">
                  {hits.map((h) => (
                    <a
                      key={h.id}
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      className="source-tag"
                    >
                      {h.section}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {!busy && (
              <div className="feedback-area">
                <span className="feedback-label">도움이 되었나요?</span>
                <div className="feedback-buttons">
                  <button
                    className={`feedback-btn ${feedback === "up" ? "active" : ""}`}
                    onClick={() => setFeedback("up")}
                  >
                    &#128077;
                  </button>
                  <button
                    className={`feedback-btn ${feedback === "down" ? "active" : ""}`}
                    onClick={() => setFeedback("down")}
                  >
                    &#128078;
                  </button>
                </div>
                <button className="judge-btn" onClick={runJudge} disabled={judging}>
                  {judging ? "판정 중..." : "자동판정"}
                </button>
              </div>
            )}
            {judgement && (
              <div className="judgement-area">
                <div className="judgement-title">
                  자동판정 (LLM-as-a-Judge) &middot; 점수 {judgement.score}/100
                </div>
                <div className="judgement-flags">
                  <span className={`judgement-flag ${judgement.grounded ? "flag-pass" : "flag-fail"}`}>
                    {judgement.grounded ? "✅" : "❌"} 근거기반
                  </span>
                  <span className={`judgement-flag ${judgement.noHalluc ? "flag-pass" : "flag-fail"}`}>
                    {judgement.noHalluc ? "✅" : "❌"} 지어내지않음
                  </span>
                  <span className={`judgement-flag ${judgement.cited ? "flag-pass" : "flag-fail"}`}>
                    {judgement.cited ? "✅" : "❌"} 출처표시
                  </span>
                  <span className={`judgement-flag ${judgement.refusal ? "flag-pass" : "flag-fail"}`}>
                    {judgement.refusal ? "✅" : "❌"} 정중거부
                  </span>
                </div>
                <div className="judgement-comment">{judgement.comment}</div>
              </div>
            )}
          </div>
        )}

        {/* 입력 영역 */}
        <div className="input-wrapper">
          <div className="input-area">
            <button
              className={`mic-btn ${recording ? "recording" : ""}`}
              onClick={toggleVoice}
              disabled={busy}
              title="음성으로 질문하기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <input
              type="text"
              className="input-field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="궁금한 것을 입력해 주세요..."
              disabled={busy}
            />
            <button className="send-btn" onClick={() => ask()} disabled={busy || !query.trim()}>
              {busy ? "..." : "질문하기"}
            </button>
          </div>
          <div className="input-hint">글을 쓰거나 마이크를 눌러 말씀하세요</div>
        </div>

        <div className="footer-note">이음이 — 어르신의 일상과 디지털을 이어주는 인공지능 안내자에요</div>
      </div>
    </div>
  );
}
