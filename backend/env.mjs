import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Shell variables win, then backend/.env, then the shared project .env.
dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
