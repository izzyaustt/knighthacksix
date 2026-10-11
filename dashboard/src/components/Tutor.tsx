import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { studyConfig, studySession, type StudyConfig } from '../study-api.ts';
import { prepareStudyConnection } from '../study-connection.ts';

export function Tutor() {
  return <ConversationProvider><ConversationPractice /></ConversationProvider>;
}
function ConversationPractice() {
  const [config, setConfig] = useState<StudyConfig>();
  const [scenario, setScenario] = useState('cafe');
  const [level, setLevel] = useState('A2');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [messages, setMessages] = useState<{ id: number; source: 'user' | 'ai'; text: string }[]>([]);
  const [remaining, setRemaining] = useState(180);
  const request = useRef<AbortController | null>(null);
  const deadline = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const conversation = useConversation({
    onConnect: () => { setStarting(false); deadline.current = Date.now() + 180_000; },
    onDisconnect: () => { setStarting(false); setEnded(true); deadline.current = 0; },
    onError: () => { setStarting(false); setError('The voice connection stopped. Check your microphone and connection, then try again.'); },
    onMessage: ({ event_id, source, message }) => setMessages(previous => {
      const next = { id: event_id, source, text: message };
      const index = previous.findIndex(item => item.id === event_id && item.source === source);
      return index < 0 ? [...previous, next] : previous.map((item, i) => i === index ? next : item);
    }),
  });
  const connected = conversation.status === 'connected';
  const busy = starting || conversation.status === 'connecting' || connected;
  useEffect(() => {
    const controller = new AbortController();
    studyConfig(controller.signal).then(setConfig).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { request.current?.abort(); conversation.endSession(); }, [conversation.endSession]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) conversation.endSession();
    }, 1000);
    return () => clearInterval(timer);
  }, [connected, conversation.endSession]);

  async function start() {
    if (busy) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setStarting(true); setError(''); setEnded(false); setMessages([]); setRemaining(180);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Voice practice needs a secure browser connection and microphone access.');
      const session = await prepareStudyConnection(controller.signal,
        () => studySession(scenario, level, controller.signal),
        () => navigator.mediaDevices.getUserMedia({ audio: true }));
      if (!session) return;
      conversation.startSession({ signedUrl: session.signed_url, connectionType: 'websocket', dynamicVariables: session.dynamic_variables });
    } catch (e) {
      if (controller.signal.aborted) return;
      setStarting(false);
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow your microphone in browser settings, then try again.'
        : e instanceof Error ? e.message : 'Could not start the conversation.');
    }
  }
  function end() {
    request.current?.abort(); conversation.endSession(); setStarting(false); setEnded(true); deadline.current = 0;
  }
  const selected = config?.scenarios.find(item => item.id === scenario);
  return <section className="study-page" aria-label="Spanish conversation practice">
    <div className="study-intro"><span className="study-eyebrow">LET’S TALK</span>
      <h2>A little Spanish, a real conversation.</h2>
      <p>Meet Luna, your conversation partner. Practice everyday Spanish, make mistakes, and ask for help in English whenever you need it.</p>
    </div>
    <div className="study-layout">
      <div className="study-settings">
        <h3>Choose your conversation</h3>
        <div className="study-scenarios">{config?.scenarios.map(item => <button key={item.id} type="button" disabled={busy}
          aria-pressed={scenario === item.id} onClick={() => setScenario(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>)}</div>
        <label className="study-level">Your level<select value={level} disabled={busy} onChange={e => setLevel(e.target.value)}>
          <option value="A1">A1 · Just starting</option><option value="A2">A2 · Everyday basics</option><option value="B1">B1 · Keep the conversation going</option>
        </select></label>
        <p className="muted">Luna can weave your most recently saved Spanish words into the conversation.</p>
      </div>
      <div className="study-conversation">
        <div className={`study-orb ${connected && conversation.isSpeaking ? 'speaking' : ''}`} aria-hidden="true">L</div>
        <h3>{selected?.title ?? 'Conversation practice'}</h3>
        <p className="study-state" role="status">{starting || conversation.status === 'connecting' ? 'Connecting…' : connected
          ? conversation.isMuted ? 'Microphone muted' : conversation.isSpeaking ? 'Luna is speaking' : 'Your turn — Luna is listening'
          : ended ? 'Nice practice. Ready for another conversation?' : 'Ready when you are'}</p>
        <p className="muted">{connected ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining` : 'A three-minute conversation, at your pace.'}</p>
        {error && <p className="banner" role="alert">{error}</p>}
        {config && !config.available && <p className="banner" role="status">Conversation practice is being set up. Please check back shortly.</p>}
        <div className="study-controls">{!busy ? <button className="study-primary" type="button" disabled={!config?.available} onClick={start}>Start conversation</button>
          : <><button className="study-secondary" type="button" onClick={end}>{connected ? 'End conversation' : 'Cancel'}</button>
            {connected && <button className="study-primary" type="button" aria-pressed={conversation.isMuted} onClick={() => conversation.setMuted(!conversation.isMuted)}>{conversation.isMuted ? 'Unmute microphone' : 'Mute microphone'}</button>}</>}
        </div>
        <p className="study-privacy">Starting turns on your microphone and sends your voice to ElevenLabs. End the conversation to stop. This page clears its transcript when you start another conversation or leave Study.</p>
      </div>
    </div>
    <div className="study-transcript" ref={transcript} role="log" aria-label="Conversation transcript" aria-live="polite">
      <h3>Your conversation</h3>
      {!messages.length && <p className="muted">Your conversation will appear here. Try “¿Puedes repetir?” to ask Luna to repeat, or “Más despacio, por favor” to slow things down.</p>}
      {messages.map(item => <div className={`study-message ${item.source}`} key={`${item.source}-${item.id}`}><strong>{item.source === 'user' ? 'You' : 'Luna'}</strong><p>{item.text}</p></div>)}
    </div>
  </section>;
}
