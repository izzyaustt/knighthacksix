import { useEffect, useRef, useState } from 'react';
import type { VocabWord } from '../api.ts';
import type { Language } from '../../../shared/languages.ts';
import { scoreAttempt, speechUrl, type Attempt } from '../practice-api.ts';

const MAX_SECONDS = 15;
type Message = { text: string; tone?: 'turn' | 'error' };
type Phase = 'ready' | 'permission' | 'recording' | 'checking';

/** Listen, record, and score, like the extension's "Say it" section. Remount (key) it per word. */
export function SayIt({ word, language }: { word: VocabWord; language: Language }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; // a recording stopped by unmounting is never scored
      clearInterval(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      audio.current?.pause();
    };
  }, []);
  useEffect(() => () => { if (recordingUrl) URL.revokeObjectURL(recordingUrl); }, [recordingUrl]);

  const play = async (src: Promise<string> | string, status: string) => {
    audio.current?.pause();
    setMessage({ text: 'Loading pronunciation…' });
    try {
      const url = await src;
      if (!alive.current) return;
      const playback = new Audio(url);
      audio.current = playback;
      playback.onended = () => { if (audio.current === playback) setMessage({ text: 'Your turn: tap the mic and say it.', tone: 'turn' }); };
      await playback.play();
      setMessage({ text: status });
    } catch (error) {
      if (alive.current) setMessage({ text: (error as Error).message, tone: 'error' });
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const record = async () => {
    if (phase === 'recording') { stop(); return; }
    audio.current?.pause();
    setMessage(null);
    setAttempt(null); // a new try replaces the last result
    setPhase('permission');
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Audio recording is unavailable in this browser.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!alive.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const capture = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      const tracks = stream.getTracks();
      recorder.current = capture;
      capture.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = async () => {
        tracks.forEach((t) => t.stop());
        recorder.current = null;
        if (!alive.current) return;
        setPhase('checking');
        try {
          const blob = new Blob(chunks, { type: capture.mimeType });
          if (!blob.size) throw new Error('No audio recorded. Try again.');
          setRecordingUrl(URL.createObjectURL(blob));
          const result = await scoreAttempt(blob, word.word, language, { id: word.video_id, ts: word.video_ts });
          if (alive.current) setAttempt(result);
        } catch (error) {
          if (!alive.current) return;
          // A silent recording is a retry, not a failure (the backend's wording also tells the extension user to move closer).
          const text = /no speech was detected/i.test((error as Error).message) ? 'No speech was detected. Try again.' : `Recording failed: ${(error as Error).message}`;
          setMessage({ text, tone: 'error' });
        } finally {
          if (alive.current) setPhase('ready');
        }
      };
      capture.start();
      setPhase('recording');
      setSeconds(0);
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 1000);
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      if (!alive.current) return;
      setPhase('ready');
      setMessage({ text: `Microphone unavailable: ${(error as Error).message}. Allow microphone access for this site and try again.`, tone: 'error' });
    }
  };

  const busy = phase !== 'ready';
  const hint = phase === 'permission' ? 'Requesting microphone…'
    : phase === 'recording' ? `Recording… ${seconds} / ${MAX_SECONDS} seconds. Tap the mic again to stop.`
    : phase === 'checking' ? 'Checking your recording…'
    : `Tap the mic and say the word. Up to ${MAX_SECONDS} seconds.`;
  const missed = attempt?.words.filter((w) => w.status !== 'correct') ?? [];
  const feedback = !missed.length ? 'Nice! You said it right.'
    : missed.length === 1 && missed[0].heard ? `Almost! Heard “${missed[0].heard}”. Try again.`
    : `Almost! Missed ${missed.map((w) => `“${w.word}”`).join(', ')}. Try again.`;

  return (
    <section className="say-it" aria-label="Pronunciation practice">
      <div className="say-it-listen">
        <button className="study-secondary" type="button" disabled={busy} onClick={() => play(speechUrl(word.word, 1, language), 'Playing pronunciation…')}>
          <SpeakerIcon /> Listen
        </button>
        <button className="study-secondary" type="button" disabled={busy} onClick={() => play(speechUrl(word.word, 0.7, language), 'Playing slowly…')}>
          <SpeakerIcon /> Listen slowly
        </button>
      </div>

      <div className="say-it-row">
        <button className="say-it-mic" type="button" onClick={record} disabled={phase === 'permission' || phase === 'checking'}
          aria-pressed={phase === 'recording'} aria-label={phase === 'recording' ? 'Stop recording' : `Record yourself saying ${word.word}`}>
          {phase === 'recording' ? <StopIcon /> : <MicIcon />}
        </button>
        <div>
          <p className="say-it-word" lang={language}>{word.word}</p>
          <p className="say-it-hint" role="status">{hint}</p>
        </div>
      </div>
      {message && <p className={`say-it-status${message.tone ? ` ${message.tone}` : ''}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

      {attempt && (
        <div className="say-it-attempt">
          <p className={`say-it-status say-it-result ${missed.length ? 'error' : 'turn'}`} role="status">
            <span>{feedback}</span><strong>{Math.round(attempt.score * 100)}%</strong>
          </p>
          <div className="say-it-attempt-foot">
            <span className="muted">Heard: {attempt.transcript || '(nothing)'}{attempt.event_saved ? '' : ' · not saved to your progress'}</span>
            {recordingUrl && <button className="study-secondary" type="button" disabled={busy} onClick={() => play(recordingUrl, 'Playing your recording…')}>Hear yours</button>}
          </div>
        </div>
      )}
    </section>
  );
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const SpeakerIcon = () => <svg {...iconProps}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
const MicIcon = () => <svg {...iconProps} width={28} height={28}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const StopIcon = () => <svg {...iconProps} width={28} height={28}><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /></svg>;
