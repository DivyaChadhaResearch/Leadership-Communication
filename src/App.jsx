import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  BarChart, Play, TrendingUp, Mic, Volume2, BrainCircuit,
  Layers, Zap, ShieldCheck, RefreshCw, Presentation,
  Waves, Sparkles, Trophy, Send, MicOff, Square,
  CheckCircle, AlertCircle, Pause
} from 'lucide-react';

// ─── Anthropic API helper (via Vercel serverless proxy) ────────────────────
async function callAI(systemPrompt, userMessage) {
  let response;
  try {
    response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userMessage }),
    });
  } catch (netErr) {
    throw new Error('Network error — cannot reach /api/evaluate: ' + netErr.message);
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('Server returned invalid JSON (status ' + response.status + ')'); }
  if (!response.ok) throw new Error(data?.error || 'Server error ' + response.status);
  if (!data.text) throw new Error('AI returned empty response — check your ANTHROPIC_API_KEY in Vercel env vars');
  return data.text;
}

// ─── Text-to-Speech helper ──────────────────────────────────────────────────
function speakText(text, onStart, onEnd, voiceRef) {
  if (!text || !text.trim()) { onEnd && onEnd(); return; }
  window.speechSynthesis.cancel();

  const doSpeak = (voices) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 0.9;
    utterance.volume = 1;
    utterance.lang = 'en-US';
    const preferred =
      voices.find(v => /daniel|alex|james|google uk english|en-gb/i.test(v.name)) ||
      voices.find(v => v.lang === 'en-US') ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0];
    if (preferred) utterance.voice = preferred;
    if (voiceRef) voiceRef.current = utterance;
    utterance.onstart = () => { onStart && onStart(); };
    utterance.onend = () => { onEnd && onEnd(); };
    utterance.onerror = (e) => { console.warn('TTS error:', e.error); onEnd && onEnd(); };
    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak(voices);
  } else {
    // Voices not yet loaded — wait for them
    window.speechSynthesis.onvoiceschanged = () => {
      doSpeak(window.speechSynthesis.getVoices());
      window.speechSynthesis.onvoiceschanged = null;
    };
  }
}

// ─── AI SYSTEM PROMPTS ──────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  challenge: `You are a world-class C-suite executive communication coach with 20+ years training Fortune 500 leaders.
A national sales leader has responded to a high-stakes leadership scenario. Analyse and coach them.

YOUR OUTPUT MUST FOLLOW THIS EXACT FORMAT — use these exact section headers:

SCORES:
Authority: [number]/10
Strategic Framing: [number]/10
Clarity: [number]/10
Grammar: [number]/10
Executive Vocabulary: [number]/10

EXECUTIVE REWRITE:
[Write a single polished paragraph — the perfect C-suite version of what they said. No bullet points. Write it as a complete, ready-to-speak executive statement with gravitas, precision, and strategic framing. This is what will be read aloud to them.]

COACHING TIPS:
• [Specific tip on what to improve — e.g. vocal authority, opening structure]
• [Specific tip on language or vocabulary to elevate]
• [Specific tip on strategic framing or executive presence]`,

  grammar: `You are a senior executive speech coach specialising in C-suite communication refinement.
A national sales leader has spoken a statement. Your job is to correct and elevate it to boardroom-ready communication.

YOUR OUTPUT MUST FOLLOW THIS EXACT FORMAT:

EXECUTIVE COMMUNICATION SCORE: [number]/10

ORIGINAL ISSUES IDENTIFIED:
• [Grammar error, filler word, or weak phrase found]
• [Second issue]
• [Third issue]

EXECUTIVE REWRITE:
[A single polished paragraph — the perfect executive version. No bullet points. Complete, confident, grammatically flawless, ready to be spoken aloud at C-suite level. Use strong, precise leadership language.]

IMPROVEMENTS MADE:
• [Key improvement 1 and why it matters]
• [Key improvement 2 and why it matters]`,

  slide: `You are an executive presentation strategist who coaches CEOs and board-level leaders.
A national sales leader has described their slide or presentation context. Transform it into board-ready communication.

YOUR OUTPUT MUST FOLLOW THIS EXACT FORMAT:

PRESENTATION CLARITY SCORE: [number]/10

BOARD-READY NARRATIVE:
[2-3 sentences maximum — the polished, executive-level narrative for this slide. Precise, impactful, jargon-free. This will be spoken aloud.]

IDEAL OPENING LINE:
[One single powerful sentence that a CEO would use to command the room at this moment. Make it memorable.]

DELIVERY INSTRUCTIONS:
• [Pace and tone — e.g. slow down here, drop your voice, pause after this word]
• [Where to pause for maximum impact]
• [Body language or vocal presence tip]`,
};

// ─── Parse AI response — extract the rewritten executive text for TTS ────────
function parseAIResponse(text) {
  if (!text || !text.trim()) return { ttsText: '' };

  // Priority 1: EXECUTIVE REWRITE section
  const rewrites = [
    /EXECUTIVE REWRITE:\s*\n([\s\S]*?)(?=\n\s*(?:COACHING TIPS|IMPROVEMENTS MADE|DELIVERY|$))/i,
    /EXECUTIVE REWRITE:\s*([^\n][\s\S]*?)(?=\n[A-Z]{3,}[^a-z]|$)/i,
  ];
  for (const pat of rewrites) {
    const m = text.match(pat);
    if (m && m[1] && m[1].trim().length > 20) {
      return { ttsText: m[1].trim() };
    }
  }

  // Priority 2: BOARD-READY NARRATIVE
  const narrative = text.match(/BOARD-READY NARRATIVE:\s*\n([\s\S]*?)(?=\n\s*(?:IDEAL OPENING|DELIVERY|$))/i)
    || text.match(/BOARD-READY NARRATIVE:\s*([^\n][\s\S]*?)(?=\n[A-Z]{3,}[^a-z]|$)/i);
  if (narrative && narrative[1] && narrative[1].trim().length > 20) {
    return { ttsText: narrative[1].trim() };
  }

  // Priority 3: IDEAL OPENING LINE
  const opening = text.match(/IDEAL OPENING LINE:\s*\n?([^\n]+(?:\n[^\n]+)?)/i);
  if (opening && opening[1] && opening[1].trim().length > 10) {
    return { ttsText: opening[1].trim() };
  }

  // Fallback: strip all section headers and bullet markers, return first clean paragraph
  const cleaned = text
    .replace(/^[A-Z][A-Z ]+:.*$/gm, '')     // remove ALL-CAPS headers
    .replace(/^•\s*/gm, '')                  // remove bullets
    .replace(/^\[\d+\.\d+\/10\]/gm, '')   // remove score labels
    .replace(/\n{3,}/g, '\n\n')              // collapse whitespace
    .trim();
  const firstPara = cleaned.split('\n\n').find(p => p.trim().length > 30) || cleaned;
  return { ttsText: firstPara.trim().slice(0, 600) };
}

// ─── Extract dimension scores from AI text ─────────────────────────────────
function extractScores(text) {
  if (!text) return {};
  const scores = {};
  const SKIP = ['executive communication score', 'presentation clarity score'];
  text.split('\n').forEach(line => {
    // Match "Label: 8/10" or "Label: 8.5/10"
    const m = line.match(/^\s*([A-Za-z][A-Za-z ]{1,30}):\s*(\d+(?:\.\d+)?)\/10/);
    if (m) {
      const label = m[1].trim();
      const labelLower = label.toLowerCase();
      // Overall score lines — store as Overall
      if (SKIP.some(s => labelLower.includes(s.split(' ')[0]) && labelLower.includes('score'))) {
        scores['Overall'] = parseFloat(m[2]);
      } else if (!labelLower.includes('score')) {
        scores[label] = parseFloat(m[2]);
      }
    }
    // "EXECUTIVE COMMUNICATION SCORE: 8/10" format
    const overall = line.match(/(?:SCORE|OVERALL)[^:]*:\s*(\d+(?:\.\d+)?)\/10/i);
    if (overall && !scores['Overall']) scores['Overall'] = parseFloat(overall[1]);
  });
  return scores;
}

// ─── Animated waveform bars (CSS-only) ────────────────────────────────────
function WaveBar({ delay }) {
  return (
    <div
      style={{
        width: 4,
        borderRadius: 2,
        background: 'rgba(99,102,241,0.7)',
        animationName: 'wavePulse',
        animationDuration: '0.7s',
        animationDelay: `${delay}s`,
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        animationDirection: 'alternate',
      }}
    />
  );
}

function AudioWave({ isActive }) {
  if (!isActive) return null;
  const delays = [0, 0.1, 0.2, 0.15, 0.05, 0.25, 0.12, 0.18];
  return (
    <>
      <style>{`
        @keyframes wavePulse {
          from { height: 8px; }
          to   { height: 44px; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 56 }}>
        {delays.map((d, i) => <WaveBar key={i} delay={d} />)}
      </div>
    </>
  );
}

// ─── Score Cards ────────────────────────────────────────────────────────────
function ScoreCards({ scores }) {
  const entries = Object.entries(scores);
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {entries.map(([k, v]) => (
        <div key={k} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <div className={`text-2xl font-black ${v >= 8 ? 'text-emerald-600' : v >= 6 ? 'text-amber-600' : 'text-rose-600'}`}>
            {v}<span className="text-sm text-slate-400">/10</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${v >= 8 ? 'bg-emerald-500' : v >= 6 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${v * 10}%` }}
            />
          </div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mt-2">{k}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Formatted AI text renderer ─────────────────────────────────────────────
function AIOutput({ text, dark = false }) {
  if (!text) return null;

  const SECTION_HEADERS = [
    'SCORES:', 'EXECUTIVE REWRITE:', 'COACHING TIPS:',
    'EXECUTIVE COMMUNICATION SCORE:', 'ORIGINAL ISSUES IDENTIFIED:',
    'IMPROVEMENTS MADE:', 'PRESENTATION CLARITY SCORE:',
    'BOARD-READY NARRATIVE:', 'IDEAL OPENING LINE:', 'DELIVERY INSTRUCTIONS:',
  ];

  const HIGHLIGHT_HEADERS = ['EXECUTIVE REWRITE:', 'BOARD-READY NARRATIVE:', 'IDEAL OPENING LINE:'];

  const sections = [];
  let cur = { title: '', lines: [] };
  text.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const isHeader = SECTION_HEADERS.some(h => line.startsWith(h));
    if (isHeader) {
      if (cur.title || cur.lines.length) sections.push({ ...cur });
      cur = { title: line, lines: [] };
    } else {
      cur.lines.push(line);
    }
  });
  if (cur.title || cur.lines.length) sections.push(cur);

  return (
    <div className="space-y-4 text-left">
      {sections.map((s, i) => {
        const isHighlight = HIGHLIGHT_HEADERS.some(h => s.title.startsWith(h));
        const bgClass = dark
          ? (isHighlight ? 'bg-indigo-900/40 border border-indigo-500/30' : 'bg-white/5 border border-white/10')
          : (isHighlight ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50 border border-slate-100');
        const titleColor = dark
          ? (isHighlight ? 'text-indigo-300' : 'text-white/40')
          : (isHighlight ? 'text-indigo-500' : 'text-slate-400');
        const textColor = dark
          ? (isHighlight ? 'text-indigo-100 italic text-base' : 'text-white/80 text-sm')
          : (isHighlight ? 'text-indigo-900 italic text-base' : 'text-slate-700 text-sm');

        return (
          <div key={i} className={`rounded-2xl p-5 ${bgClass}`}>
            {s.title && (
              <div className={`text-[10px] font-black uppercase tracking-widest mb-3 ${titleColor}`}>
                {s.title.replace(':', '')}
              </div>
            )}
            <div className="space-y-1.5">
              {s.lines.map((line, j) => (
                <p key={j} className={`leading-relaxed font-medium ${textColor}`}>{line}</p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Play Corrected Audio Panel ─────────────────────────────────────────────
function PlayPanel({ ttsText, isDark, onReset, resetLabel = 'Try Again' }) {
  const [playing, setPlaying] = useState(false);
  const uttRef = useRef(null);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const toggle = () => {
    if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
    speakText(ttsText, () => setPlaying(true), () => setPlaying(false), uttRef);
  };

  const playBtnClass = isDark
    ? 'bg-white text-slate-900 hover:bg-indigo-50'
    : 'bg-slate-900 text-white hover:bg-slate-800';
  const resetBtnClass = isDark
    ? 'bg-transparent text-white border border-white/20 hover:bg-white/5'
    : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50';

  return (
    <div className="flex gap-4 flex-wrap justify-center mt-6">
      <button
        onClick={toggle}
        className={`${playBtnClass} px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-xl transition-all`}
      >
        {playing ? <Pause size={18} /> : <Play fill="currentColor" size={16} />}
        {playing ? 'Pause Audio' : '▶ Play Corrected Audio'}
      </button>
      <button
        onClick={onReset}
        className={`${resetBtnClass} px-8 py-5 rounded-2xl font-black text-xs uppercase transition-all`}
      >
        {resetLabel}
      </button>
    </div>
  );
}

// ─── Universal Record + Submit Panel ───────────────────────────────────────
function RecordPanel({ theme = 'light', label, submitLabel, onSubmit, status, onReset }) {
  const recognitionRef = useRef(null);
  const [localRec, setLocalRec] = useState(false);
  const [localText, setLocalText] = useState('');

  // reset local state when parent resets
  useEffect(() => { if (status === 'idle') { setLocalText(''); setLocalRec(false); } }, [status]);

  const startRec = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition requires Chrome or Edge browser.'); return; }
    const r = new SR();
    recognitionRef.current = r;
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = true;
    setLocalText('');
    setLocalRec(true);
    r.onresult = e => {
      const t = Array.from(e.results).map(x => x[0].transcript).join('');
      setLocalText(t);
    };
    r.onerror = () => setLocalRec(false);
    r.onend = () => setLocalRec(false);
    r.start();
  };

  const stopRec = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setLocalRec(false);
  };

  const submit = () => {
    if (localText.trim()) onSubmit(localText);
  };

  const clearAll = () => {
    setLocalText('');
    setLocalRec(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    onReset?.();
  };

  const isDark = theme === 'dark';
  const showIdle   = !localRec && !localText;
  const showRec    = localRec;
  const showReview = !localRec && !!localText && status !== 'processing';

  if (status === 'processing') {
    return (
      <div className="flex flex-col items-center gap-5">
        <RefreshCw className={`animate-spin ${isDark ? 'text-white opacity-60' : 'text-indigo-600'}`} size={60} />
        <p className={`text-xs font-black uppercase tracking-widest animate-pulse ${isDark ? 'text-white' : 'text-indigo-600'}`}>
          AI Evaluating Your Speech…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Mic button */}
      {showIdle && (
        <button
          onClick={startRec}
          className="w-28 h-28 rounded-full bg-indigo-600 border-4 border-indigo-400 flex items-center justify-center text-white shadow-2xl hover:scale-105 transition-all"
        >
          <Mic size={44} />
        </button>
      )}

      {/* Stop button */}
      {showRec && (
        <button
          onClick={stopRec}
          className="w-28 h-28 rounded-full bg-rose-500 border-4 border-rose-300 flex items-center justify-center text-white shadow-2xl animate-pulse"
        >
          <Square size={36} fill="white" />
        </button>
      )}

      {/* Status label */}
      <p className={`font-black text-[10px] uppercase tracking-[0.3em] ${showRec ? 'text-rose-500' : isDark ? 'text-white/40' : 'text-slate-400'}`}>
        {showRec ? '● Recording — tap to stop' : showReview ? 'Review & submit below ↓' : label}
      </p>

      {/* Waveform */}
      {showRec && <AudioWave isActive={true} />}

      {/* Transcript box */}
      {localText && (
        <div className={`p-6 rounded-3xl max-w-xl w-full shadow-inner ${
          isDark ? 'bg-white/5 border border-white/10' : 'bg-indigo-50 border border-indigo-100'
        }`}>
          <span className={`text-[8px] font-black uppercase mb-2 block ${isDark ? 'text-indigo-300' : 'text-indigo-400'}`}>
            Captured Speech:
          </span>
          <p className={`italic text-sm font-medium leading-relaxed ${isDark ? 'text-indigo-100 text-base' : 'text-indigo-700'}`}>
            "{localText}"
          </p>
          {showReview && (
            <button onClick={clearAll} className={`mt-3 text-[10px] font-black uppercase tracking-widest hover:text-rose-500 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
              ✕ Clear & Re-record
            </button>
          )}
        </div>
      )}

      {/* Submit button */}
      {showReview && (
        <button
          onClick={submit}
          className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black uppercase text-xs flex items-center gap-3 shadow-xl hover:bg-indigo-700 transition-all"
        >
          <Send size={18} /> {submitLabel}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════
const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tasksDone, setTasksDone] = useState(5);
  const totalTasks = 10;

  const [status, setStatus] = useState('idle');
  const [aiResult, setAiResult] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [error, setError] = useState('');

  const challenges = [
    { id: 1, title: 'The Boardroom Pivot',   difficulty: 'Expert', goal: 'Convince stakeholders to cut 20% budget without losing morale.' },
    { id: 2, title: 'Crisis Equanimity',      difficulty: 'High',   goal: 'Address a PR disaster regarding data privacy.' },
    { id: 3, title: 'Series B Pitch',         difficulty: 'Pro',    goal: 'Translate technical debt into a strategic growth roadmap.' },
    { id: 4, title: 'Conflict Mediation',     difficulty: 'Medium', goal: 'De-escalate a dispute between two senior VPs.' },
    { id: 5, title: 'The Visionary Keynote',  difficulty: 'Hard',   goal: 'Deliver a 30-second "future of the company" hook.' },
  ];

  const executiveSkills = [
    { name: 'Strategic Influence', level: 82, icon: Zap,         color: 'bg-amber-500' },
    { name: 'Vocal Authority',     level: 65, icon: Volume2,     color: 'bg-indigo-500' },
    { name: 'Crisis Comms',        level: 45, icon: ShieldCheck, color: 'bg-rose-500' },
    { name: 'Visionary Clarity',   level: 90, icon: BrainCircuit,color: 'bg-emerald-500' },
  ];

  const reset = () => { setStatus('idle'); setAiResult(null); setError(''); };

  const switchTab = (id) => { setActiveTab(id); reset(); setSelectedChallenge(null); };

  const runEvaluation = useCallback(async (spokenText, type) => {
    if (!spokenText.trim()) return;
    setStatus('processing');
    setError('');
    setAiResult(null);
    try {
      const userMsg = type === 'challenge'
        ? 'Scenario: "' + (selectedChallenge?.title || '') + '"\nGoal: "' + (selectedChallenge?.goal || '') + '"\nLeader response: "' + spokenText + '"'
        : 'Leader statement to evaluate: "' + spokenText + '"'
      console.log('Sending to AI — type:', type, 'length:', spokenText.length);
      const raw = await callAI(SYSTEM_PROMPTS[type], userMsg);
      console.log('AI raw response (first 200):', raw.slice(0, 200));
      const { ttsText } = parseAIResponse(raw);
      const scores = extractScores(raw);
      console.log('Parsed ttsText length:', ttsText.length, 'scores:', scores);
      setAiResult({ full: raw, ttsText, scores });
      setStatus('ready');
      setTasksDone(p => Math.min(p + 1, totalTasks));
    } catch (err) {
      console.error('runEvaluation error:', err);
      setError(err.message || 'Unknown error during AI evaluation');
      setStatus('idle');
    }
  }, [selectedChallenge]);

  const SidebarItem = ({ icon: Icon, label, id }) => (
    <button
      onClick={() => switchTab(id)}
      className={`flex items-center w-full p-4 space-x-3 transition-all rounded-xl ${
        activeTab === id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
      }`}
    >
      <Icon size={20} />
      <span className="font-semibold text-sm">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col shrink-0 border-r border-white/5">
        <div className="p-8">
          <div className="flex items-center space-x-4 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl -rotate-6 flex items-center justify-center shadow-lg border border-white/20">
              <TrendingUp className="text-white" size={24} />
            </div>
            <span className="text-xl font-black text-white tracking-tighter uppercase italic">
              Voice<span className="text-indigo-500">Hub</span>
            </span>
          </div>
          <nav className="space-y-2">
            <SidebarItem icon={BarChart}     label="Dashboard"       id="dashboard"  />
            <SidebarItem icon={Trophy}       label="Leadership Lab"  id="voice"      />
            <SidebarItem icon={Presentation} label="Slide Architect" id="slide-arch" />
            <SidebarItem icon={BrainCircuit} label="Free-Speak AI"   id="freespeak"  />
            <SidebarItem icon={Layers}       label="Skill Tracker"   id="tracker"    />
          </nav>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">
            Executive Portal{' '}
            <span className="text-[10px] bg-indigo-600 text-white px-3 py-1 rounded-full uppercase ml-2 tracking-widest font-bold not-italic">
              Active Session
            </span>
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">AI Status</span>
              <span className={`text-[10px] font-bold uppercase ${
                status === 'processing' ? 'text-rose-500 animate-pulse' :
                status === 'ready'      ? 'text-emerald-500'            : 'text-emerald-500'
              }`}>
                {status === 'processing' ? 'Evaluating…' :
                 status === 'ready'      ? 'Analysis Ready' : 'System Ready'}
              </span>
            </div>
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black shadow-lg">R</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">

          {/* ── DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <div className="p-8 space-y-8 max-w-7xl mx-auto">
              <div className="bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden shadow-2xl">
                <div className="relative z-10">
                  <h2 className="text-5xl font-black mb-4 tracking-tighter italic">Strategic Voice Hub</h2>
                  <p className="text-slate-400 max-w-lg mb-8 leading-relaxed font-medium">
                    Elevate your executive presence through AI-driven vocal analysis, real-time coaching, and leadership training.
                  </p>
                  <button onClick={() => setActiveTab('voice')} className="bg-indigo-600 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 hover:bg-indigo-500 transition-all">
                    <Trophy size={18} /> Access Leadership Lab
                  </button>
                </div>
                <Waves className="absolute bottom-[-50px] right-[-50px] opacity-10 text-indigo-400" size={300} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {executiveSkills.map((s, i) => (
                  <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <div className={`p-3 rounded-xl ${s.color} text-white mb-4 w-fit shadow-md`}><s.icon size={20} /></div>
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">{s.name}</div>
                    <div className="text-2xl font-black text-slate-800">{s.level}%</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
                <h3 className="font-black text-lg text-slate-800 uppercase italic tracking-tighter mb-6">How It Works</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { n: '01', t: 'Speak', d: 'Record your response to a leadership challenge, slide context, or free-form statement using your microphone.', I: Mic },
                    { n: '02', t: 'AI Evaluates', d: 'Claude analyses your grammar, authority, strategic framing, and executive vocabulary — in real time.', I: BrainCircuit },
                    { n: '03', t: 'Hear & Read', d: 'Receive a corrected leadership-level text output AND listen to the model audio via text-to-speech.', I: Volume2 },
                  ].map(({ n, t, d, I }) => (
                    <div key={n} className="flex gap-4">
                      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0">{n}</div>
                      <div>
                        <div className="font-black text-slate-800 mb-1">{t}</div>
                        <p className="text-slate-500 text-sm leading-relaxed">{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── LEADERSHIP LAB ── */}
          {activeTab === 'voice' && (
            <div className="p-8 max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Leadership Lab</h2>
                <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
                  <Trophy size={16} /> {tasksDone}/{totalTasks} Mastered
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
                <div className="lg:col-span-1 space-y-3 overflow-y-auto max-h-[680px] pr-2">
                  {challenges.map(c => (
                    <button key={c.id}
                      onClick={() => { setSelectedChallenge(c); reset(); }}
                      className={`w-full p-5 rounded-3xl border text-left transition-all ${
                        selectedChallenge?.id === c.id
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl translate-x-2'
                          : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200'
                      }`}
                    >
                      <div className={`text-[9px] font-black uppercase mb-1 tracking-widest ${selectedChallenge?.id === c.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {c.difficulty} Level
                      </div>
                      <h4 className="font-bold text-sm leading-tight">{c.title}</h4>
                      <p className={`text-xs mt-1 leading-snug ${selectedChallenge?.id === c.id ? 'text-indigo-200' : 'text-slate-400'}`}>{c.goal}</p>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-2">
                  {selectedChallenge ? (
                    <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl min-h-[580px] flex flex-col">
                      <h3 className="text-2xl font-black text-slate-800 mb-1 uppercase italic">{selectedChallenge.title}</h3>
                      <p className="text-slate-500 italic font-medium mb-8 text-sm">Goal: "{selectedChallenge.goal}"</p>

                      {error && (
                        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-sm font-medium">
                          <AlertCircle size={18} /> {error}
                        </div>
                      )}

                      {status !== 'ready' ? (
                        <div className="flex-1 flex items-center justify-center">
                          <RecordPanel
                            theme="light"
                            label="Tap to respond to this challenge"
                            submitLabel="Submit for AI Assessment"
                            onSubmit={t => runEvaluation(t, 'challenge')}
                            status={status}
                            onReset={reset}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto">
                          <div className="flex items-center gap-2 mb-5">
                            <CheckCircle className="text-emerald-500" size={20} />
                            <span className="font-black text-sm uppercase tracking-widest text-emerald-600">Assessment Complete</span>
                          </div>
                          <ScoreCards scores={aiResult?.scores || {}} />
                          <AIOutput text={aiResult?.full || ''} />
                          <PlayPanel ttsText={aiResult?.ttsText || ''} isDark={false} onReset={reset} resetLabel="New Attempt" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-100/50 rounded-[3rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[580px] text-slate-400">
                      <Trophy size={64} className="mb-4 opacity-10" />
                      <p className="font-bold uppercase tracking-widest text-xs">Select a leadership challenge</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── SLIDE ARCHITECT ── */}
          {activeTab === 'slide-arch' && (
            <div className="p-8 max-w-4xl mx-auto">
              <h2 className="text-3xl font-black text-slate-800 mb-2 flex items-center gap-3 uppercase italic tracking-tighter">
                <Presentation className="text-indigo-600" /> Slide Architect
              </h2>
              <p className="text-slate-500 text-sm mb-8 font-medium">
                Describe your slide context — AI generates a board-ready narrative, scores your delivery, and plays it back.
              </p>

              <div className="bg-white p-16 rounded-[4rem] border border-slate-100 shadow-xl text-center min-h-[520px] flex flex-col justify-center items-center">
                {error && (
                  <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-sm font-medium w-full max-w-lg">
                    <AlertCircle size={18} /> {error}
                  </div>
                )}

                {status !== 'ready' ? (
                  <RecordPanel
                    theme="light"
                    label="Describe your slide context"
                    submitLabel="Generate Board-Ready Narrative"
                    onSubmit={t => runEvaluation(t, 'slide')}
                    status={status}
                    onReset={reset}
                  />
                ) : (
                  <div className="w-full text-left">
                    <div className="flex items-center gap-2 mb-5">
                      <CheckCircle className="text-emerald-500" size={20} />
                      <span className="font-black text-sm uppercase tracking-widest text-emerald-600">Narrative Generated</span>
                    </div>
                    <ScoreCards scores={aiResult?.scores || {}} />
                    <AIOutput text={aiResult?.full || ''} />
                    <PlayPanel ttsText={aiResult?.ttsText || ''} isDark={false} onReset={reset} resetLabel="New Slide" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── FREE-SPEAK AI ── */}
          {activeTab === 'freespeak' && (
            <div className="p-8 max-w-4xl mx-auto pb-20">
              <h2 className="text-3xl font-black text-slate-800 mb-2 flex items-center gap-3 uppercase italic tracking-tighter">
                <BrainCircuit className="text-indigo-600" /> Free-Speak AI
              </h2>
              <p className="text-slate-500 text-sm mb-8 font-medium">
                Speak any statement — AI refines it to C-suite level, scores your grammar, and plays the corrected version aloud.
              </p>

              <div className="bg-slate-900 text-white p-16 rounded-[5rem] shadow-2xl relative overflow-hidden min-h-[560px] flex flex-col items-center justify-center text-center">
                <h3 className="text-3xl font-black mb-3 tracking-tighter italic relative z-10">Executive Impact Refiner</h3>
                <p className="text-slate-400 text-sm mb-10 relative z-10 max-w-md">
                  Any phrase → grammatically perfect → C-suite-level delivery
                </p>

                {error && (
                  <div className="mb-6 p-4 bg-rose-900/50 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-sm font-medium w-full max-w-lg z-10">
                    <AlertCircle size={18} /> {error}
                  </div>
                )}

                <div className="relative z-10 w-full flex flex-col items-center">
                  {status !== 'ready' ? (
                    <RecordPanel
                      theme="dark"
                      label="Tap to speak"
                      submitLabel="Refine My Communication"
                      onSubmit={t => runEvaluation(t, 'grammar')}
                      status={status}
                      onReset={reset}
                    />
                  ) : (
                    <div className="w-full space-y-5">
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle className="text-emerald-400" size={20} />
                        <span className="font-black text-sm uppercase tracking-widest text-emerald-400">Refinement Complete</span>
                      </div>
                      {/* Dark score cards */}
                      {Object.keys(aiResult?.scores || {}).length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
                          {Object.entries(aiResult.scores).map(([k, v]) => (
                            <div key={k} className="bg-white/10 rounded-2xl p-4 text-center border border-white/10">
                              <div className={`text-2xl font-black ${v >= 8 ? 'text-emerald-400' : v >= 6 ? 'text-amber-400' : 'text-rose-400'}`}>
                                {v}<span className="text-sm text-white/30">/10</span>
                              </div>
                              <div className="text-[10px] font-black text-white/40 uppercase tracking-wider mt-1">{k}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bg-white/10 p-8 rounded-[2.5rem] border border-white/15 text-left backdrop-blur-sm">
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-3">AI Assessment</div>
                        <AIOutput text={aiResult?.full || ''} dark={true} />
                      </div>
                      <PlayPanel ttsText={aiResult?.ttsText || ''} isDark={true} onReset={reset} resetLabel="New Phrase" />
                    </div>
                  )}
                </div>
                <Waves className="absolute bottom-[-100px] left-[-100px] opacity-5 text-white" size={400} />
              </div>
            </div>
          )}

          {/* ── SKILL TRACKER ── */}
          {activeTab === 'tracker' && (
            <div className="p-8 max-w-6xl mx-auto pb-20">
              <h2 className="text-3xl font-black text-slate-800 mb-10 uppercase italic tracking-tighter">Executive Evolution</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {executiveSkills.map((s, i) => (
                  <div key={i} className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-8">
                      <div className={`p-5 rounded-2xl ${s.color} text-white shadow-xl`}><s.icon size={28} /></div>
                      <div className="text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mastery Level</span>
                        <div className="text-2xl font-black text-slate-800">{s.level}%</div>
                      </div>
                    </div>
                    <h4 className="font-black text-2xl mb-6 italic">{s.name}</h4>
                    <div className="h-4 bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner p-1">
                      <div className={`h-full ${s.color} transition-all duration-[2s] rounded-full shadow-lg`} style={{ width: `${s.level}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
