import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// A fresh clone must start with no setup at all, so every variable has a working default and
// frontend/.env is an override rather than a prerequisite. The app computes its own arithmetic and
// only calls the API for the ML hotspot estimate, so the default below is allowed to be absent.
const DEFAULTS = {
  REACT_APP_BACKEND_URL: 'http://localhost:8001',
  FRONTEND_HOST: '127.0.0.1',
  FRONTEND_PORT: '3000',
  FRONTEND_ALLOWED_HOSTS: 'localhost,127.0.0.1',
};

export default defineConfig(({ mode }) => {
  const env = { ...DEFAULTS, ...loadEnv(mode, process.cwd(), '') };
  let apiHost: string[] = [];
  try {
    apiHost = [new URL(env.REACT_APP_BACKEND_URL).hostname];
  } catch {
    throw new Error(`REACT_APP_BACKEND_URL is not a valid URL: ${env.REACT_APP_BACKEND_URL}`);
  }

  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    define: { 'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL) },
    server: {
      host: env.FRONTEND_HOST,
      port: Number(env.FRONTEND_PORT),
      strictPort: true,
      allowedHosts: [...apiHost, ...env.FRONTEND_ALLOWED_HOSTS.split(',').filter(Boolean)],
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
