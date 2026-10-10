import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { useSession } from './auth.ts';
import { SignIn } from './components/SignIn.tsx';
import './styles.css';

function Root() {
  const session = useSession();
  return session ? <App user={session.user} /> : <SignIn />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
