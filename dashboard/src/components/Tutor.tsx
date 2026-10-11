import { cleanTutorText, wordTip, isReviewVocabulary } from '../../../shared/tutor-feedback.ts';
import { LANGUAGES, type Language } from '../../../shared/languages.ts';
import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { studyConfig, studySession, studyReview, type StudyConfig, type StudyReview, type StudyMessage } from '../study-api.ts';
import { prepareStudyConnection } from '../study-connection.ts';

function briefFeedback(text: string, limit: number) {
  const clean = cleanTutorText(text);
  const words = clean.split(/\s+/u);
  return words.length > limit ? `${words.slice(0, limit).join(' ')}…` : clean;
}

export function Tutor({ language }: { language: Language }) {
  return <ConversationProvider><ConversationPractice language={language} /></ConversationProvider>;
}
function ConversationPractice({ language }: { language: Language }) {
  const info = LANGUAGES[language];
  const [config, setConfig] = useState<StudyConfig>();
  const [scenario, setScenario] = useState('cafe');
  const [level, setLevel] = useState('A2');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [review, setReview] = useState<StudyReview>();
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewRetry, setReviewRetry] = useState(0);
  const reviewId = useRef('');
  const reviewMessages = useRef<StudyMessage[] | null>(null);
  const latestMessages = useRef<StudyMessage[]>([]);
  const sessionContext = useRef({ scenario, level });
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
    studyConfig(controller.signal, language).then(setConfig).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [language]);
  useEffect(() => () => { request.current?.abort(); conversation.endSession(); }, [conversation.endSession]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => { latestMessages.current = messages; }, [messages]);
  useEffect(() => {
    if (!ended || !reviewId.current || review) return;
    const controller = new AbortController();
    setReviewing(true); setReviewError('');
    // Allow the SDK's final transcript update to arrive after disconnect.
    const timer = setTimeout(() => {
      // A retry must use the same transcript, even if a delayed SDK event arrives.
      reviewMessages.current ??= latestMessages.current;
      studyReview({ review_id: reviewId.current, lang: language, ...sessionContext.current, messages: reviewMessages.current }, controller.signal)
        .then(result => { if (!controller.signal.aborted) { setReview(result); setReviewing(false); } })
        .catch(e => { if (!controller.signal.aborted) { setReviewError(e.message); setReviewing(false); } });
    }, 750);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ended, language, reviewRetry, review]);
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
    reviewId.current = crypto.randomUUID(); reviewMessages.current = null; latestMessages.current = [];
    sessionContext.current = { scenario, level };
    setReview(undefined); setReviewError(''); setReviewing(false);
    setStarting(true); setError(''); setEnded(false); setMessages([]); setRemaining(180);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Voice practice needs a secure browser connection and microphone access.');
      const session = await prepareStudyConnection(controller.signal,
        () => studySession(scenario, level, controller.signal, language),
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
  const grammarTips = review?.struggles.filter(word => word.kind === 'grammar' || !isReviewVocabulary(word.word, language)) ?? [];
  const reviewWords = review?.struggles.filter(word => word.kind !== 'grammar' && isReviewVocabulary(word.word, language)) ?? [];
  const selected = config?.scenarios.find(item => item.id === scenario);
  return <section className="study-page" aria-label={`${info.name} conversation practice`}>
    <div className="study-intro">
      <h2>A little {info.name}, a real conversation.</h2>
      <p>Meet Luna, your conversation partner. Practice everyday {info.name}, make mistakes, and ask for help in English whenever you need it.</p>
    </div>
    <div className="study-layout">
      <div className="study-settings">
        <h3>Choose your conversation</h3>
        <div className="study-scenarios">{config?.scenarios.map(item => <button key={item.id} type="button" disabled={busy}
          aria-pressed={scenario === item.id} onClick={() => setScenario(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>)}</div>
        <label className="study-level">Your level<select value={level} disabled={busy} onChange={e => setLevel(e.target.value)}>
          <option value="A1">A1 · Just starting</option><option value="A2">A2 · Everyday basics</option><option value="B1">B1 · Keep the conversation going</option>
        </select></label>
        <p className="muted">Luna can weave your most recently saved {info.name} words into the conversation.</p>
      </div>
      <div className="study-conversation">
        <div className={`study-orb ${connected && conversation.isSpeaking ? 'speaking' : ''}`} aria-hidden="true"><img src="/study-orb.svg" alt="" /></div>
        <h3>{selected?.title ?? 'Conversation practice'}</h3>
        <p className="study-state" role="status">{starting || conversation.status === 'connecting' ? 'Connecting…' : connected
          ? conversation.isMuted ? 'Microphone muted' : conversation.isSpeaking ? 'Luna is speaking' : 'Your turn — Luna is listening'
          : ended ? 'Nice practice. Ready for another conversation?' : 'Ready when you are'}</p>
        <p className="muted">{connected ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining` : 'A three-minute conversation, at your pace.'}</p>
        {error && <p className="banner" role="alert">{error}</p>}
        {config && !config.available && <p className="banner" role="status">Conversation practice is being set up. Please check back shortly.</p>}
        <div className="study-controls">{!busy ? <button className="study-primary" type="button" disabled={!config?.available || reviewing} onClick={start}>Start conversation</button>
          : <><button className="study-secondary" type="button" onClick={end}>{connected ? 'End conversation' : 'Cancel'}</button>
            {connected && <button className="study-primary" type="button" aria-pressed={conversation.isMuted} onClick={() => conversation.setMuted(!conversation.isMuted)}>{conversation.isMuted ? 'Unmute microphone' : 'Mute microphone'}</button>}</>}
        </div>
        <p className="study-privacy">Starting turns on your microphone and sends your voice to ElevenLabs. After you finish, your transcript is sent for AI feedback. Your rating, review words, and relevant dialogue excerpts are saved to your account. This page clears the full transcript when you start again or leave Tutor.</p>
      </div>
    </div>
    {ended && <section className="study-feedback" aria-label="Conversation feedback" aria-live="polite">
      <h3>Your conversation feedback</h3>
      {reviewing && <p role="status">Luna is reviewing your replies and finding words to practice…</p>}
      {reviewError && <><p className="banner" role="alert">{reviewError}</p><button type="button" className="study-secondary" onClick={() => setReviewRetry(n => n + 1)}>Retry feedback</button></>}
      {review && <>
        {review.score !== null && <p className="study-rating"><strong>{review.score}/100</strong> · Practice rating at {sessionContext.current.level}</p>}
        <p>{briefFeedback(review.summary, 35)}</p>
        {review.ratings && <>
          <div className="study-rating-grid">{Object.entries(review.ratings).map(([name, rating]) => <div key={name}><strong>{name.charAt(0).toUpperCase() + name.slice(1)} · {rating.score}/5</strong></div>)}</div>
          <details><summary>Rating details</summary>
            {review.summary.trim().split(/\s+/u).length > 35 && <p>{cleanTutorText(review.summary)}</p>}
            {Object.entries(review.ratings).map(([name, rating]) => <p key={name}><strong>{name.charAt(0).toUpperCase() + name.slice(1)}:</strong> {cleanTutorText(rating.feedback)}</p>)}
          </details>
        </>}
        {review.status === 'completed' && <><p className="muted">AI feedback · Pronunciation not rated</p>
          {grammarTips.length > 0 && <><h3>Grammar tips</h3>{grammarTips.map(word => <article className="study-review-word" key={word.word}>
            <p>{wordTip(word.word, word.better_reply, word.reason)}</p>
            {!/[¿?？]/u.test(word.better_reply) && <p><strong>Try answering:</strong> {word.better_reply}</p>}
          </article>)}</>}
          <h3>Words to revisit</h3>
          {review.vocabulary_warning && reviewWords.length > 0 && <p className="study-feedback-note" role="status">Your rating is saved. Only words with a clear practice example were added.</p>}
          {!reviewWords.length && <p className={review.vocabulary_warning ? 'study-feedback-note' : 'muted'} role="status">{review.vocabulary_warning ? 'Your rating is saved. We couldn’t find a clear word tip this time—try another conversation.' : 'No clear vocabulary gaps this time. Keep practicing!'}</p>}
          {reviewWords.map(word => <article className="study-review-word" key={word.word}>
            <h4>{word.word} <span>· {word.translation}</span></h4><p>{briefFeedback(wordTip(word.word, word.better_reply, word.reason), 20)}</p>
            {/[¿?？]/u.test(word.better_reply)
              ? <p className="muted">An answer example wasn’t available for this word.</p>
              : <p><strong>Try answering:</strong> {word.better_reply}</p>}
            <details><summary>See the exchange</summary>
              {word.reason.trim().split(/\s+/u).length > 20 && <p>{wordTip(word.word, word.better_reply, word.reason)}</p>}
              <p><strong>Luna:</strong> {word.question}</p><p><strong>You:</strong> {word.reply}</p>
            </details>
            <p className="muted">Saved to vocabulary</p>
          </article>)}</>}
      </>}
    </section>}
    <div className="study-transcript" ref={transcript} role="log" aria-label="Conversation transcript" aria-live="polite">
      <h3>Your conversation</h3>
      {!messages.length && <p className="muted">Your conversation will appear here. Try “{info.repeat}” to ask Luna to repeat, or “{info.slower}” to slow things down.</p>}
      {messages.map(item => <div className={`study-message ${item.source}`} key={`${item.source}-${item.id}`}><strong>{item.source === 'user' ? 'You' : 'Luna'}</strong><p>{item.text}</p></div>)}
    </div>
  </section>;
}
