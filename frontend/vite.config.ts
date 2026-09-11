import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!env.REACT_APP_BACKEND_URL || !env.FRONTEND_PORT || !env.FRONTEND_HOST) throw new Error('Missing application environment');
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    define: { 'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL) },
    server: { host: env.FRONTEND_HOST, port: Number(env.FRONTEND_PORT), strictPort: true, allowedHosts: [new URL(env.REACT_APP_BACKEND_URL).hostname, ...env.FRONTEND_ALLOWED_HOSTS.split(',')] },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});