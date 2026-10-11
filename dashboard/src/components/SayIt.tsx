import { useEffect, useRef, useState } from 'react';
import type { VocabWord } from '../api.ts';
import type { Language } from '../../../shared/languages.ts';
import { scoreAttempt, speechUrl, type Attempt } from '../practice-api.ts';

const MAX_SECONDS = 15;
type Phase = 'ready' | 'permission' | 'recording' | 'checking';

/** Listen, record, and score, like the extension's "Say it" section. Remount (key) it per word. */
export function SayIt({ word, language }: { word: VocabWord; language: Language }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState('');
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
    setMessage('Loading pronunciation…');
    try {
      const url = await src;
      if (!alive.current) return;
      const playback = new Audio(url);
      audio.current = playback;
      playback.onended = () => { if (audio.current === playback) setMessage('Your turn: tap the mic and say it.'); };
      await playback.play();
      setMessage(status);
    } catch (error) {
      if (alive.current) setMessage((error as Error).message);
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const record = async () => {
    if (phase === 'recording') { stop(); return; }
    audio.current?.pause();
    setMessage('');
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
          if (alive.current) setMessage(`Recording failed: ${(error as Error).message}`);
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
      setMessage(`Microphone unavailable: ${(error as Error).message}. Allow microphone access for this site and try again.`);
    }
  };

  const busy = phase !== 'ready';
  const hint = phase === 'permission' ? 'Requesting microphone…'
    : phase === 'recording' ? `Recording… ${seconds} / ${MAX_SECONDS} seconds. Tap the mic again to stop.`
    : phase === 'checking' ? 'Checking your recording…'
    : `Tap the mic and say the word. Up to ${MAX_SECONDS} seconds.`;
  const retry = attempt?.words.filter((w) => w.status !== 'correct').map((w) => w.word) ?? [];

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
      {message && <p className="say-it-status" role="status">{message}</p>}

      {attempt && (
        <div className="say-it-attempt">
          <div className="say-it-attempt-head"><span>Your attempt</span><strong>{Math.round(attempt.score * 100)}%</strong></div>
          <div className="say-it-chips">
            {attempt.words.map((w, i) => (
              <span key={i} data-status={w.status}>
                {w.status === 'correct' ? `${w.word} ✓` : `${w.word} · ${w.heard ? `heard “${w.heard}”` : 'missed'}`}
              </span>
            ))}
          </div>
          <p>Heard: {attempt.transcript || '(nothing)'}</p>
          <p>{retry.length ? `Listen slowly, then retry: ${retry.join(', ')}.` : 'All target words were recognized. Try again at normal speed.'}</p>
          <p className="muted">This compares the transcript rather than grading your accent. {attempt.event_saved ? 'Saved to your progress.' : 'Feedback received, but progress was not saved.'}</p>
          {recordingUrl && <button className="study-secondary" type="button" disabled={busy} onClick={() => play(recordingUrl, 'Playing your recording…')}>Hear yours</button>}
        </div>
      )}
    </section>
  );
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const SpeakerIcon = () => <svg {...iconProps}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
const MicIcon = () => <svg {...iconProps} width={28} height={28}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const StopIcon = () => <svg {...iconProps} width={28} height={28}><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /></svg>;
