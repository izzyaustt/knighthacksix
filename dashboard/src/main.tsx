import { isLanguage, type Language } from '../../shared/languages.ts';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { useSession } from './auth.ts';
import { SignIn } from './components/SignIn.tsx';
import './styles.css';

function Root() {
  const session = useSession();
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('langtube:language');
    return isLanguage(saved) ? saved : 'es';
  });
  const chooseLanguage = (next: Language) => { localStorage.setItem('langtube:language', next); setLanguage(next); };
  return session ? <App key={language} user={session.user} language={language} onLanguageChange={chooseLanguage} /> : <SignIn />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
