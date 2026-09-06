import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const allowedHost = process.env.VITE_ALLOWED_HOST?.trim();
const proxy = (target: string, prefix: string) => ({
  target,
  changeOrigin: false,
  rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ''),
});
const authTarget = process.env.VITE_GUILD_AUTH_TARGET?.trim();
const restTarget = process.env.VITE_GUILD_REST_TARGET?.trim();

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    allowedHosts: allowedHost ? [allowedHost] : [],
    proxy: {
      ...(authTarget ? { '/auth': proxy(authTarget, '/auth') } : {}),
      ...(restTarget ? { '/rest': proxy(restTarget, '/rest') } : {}),
    },
  },
  preview: { host: '127.0.0.1' },
});
