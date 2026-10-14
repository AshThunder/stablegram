import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const apiRoutes: Record<string, string> = {
  '/api/wallet/device-token': '/api/wallet/device-token.ts',
  '/api/wallet/initialize': '/api/wallet/initialize.ts',
  '/api/wallet/transfer': '/api/wallet/transfer.ts',
  '/api/registry': '/api/registry.ts',
  '/api/rpc': '/api/rpc.ts',
  '/api/names/sign': '/api/names/sign.ts',
  '/api/names/claim': '/api/names/claim.ts',
  '/api/telegram': '/api/telegram.ts',
  '/api/auth/google-return': '/api/auth/google-return.ts',
};

function devApi() {
  return {
    name: 'stablegram-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const file = apiRoutes[url];
        if (!file || !req.method) return next();
        const reply = res as ServerResponse & {
          status: (code: number) => ServerResponse;
          json: (body: unknown) => void;
        };
        reply.status = (code: number) => {
          res.statusCode = code;
          return reply;
        };
        reply.json = (body: unknown) => {
          if (!res.headersSent) res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          const mod = await server.ssrLoadModule(file);
          await mod.default(req as IncomingMessage, reply);
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'API error' }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return {
    plugins: [
      {
        name: 'jsonwebtoken-shim',
        enforce: 'pre',
        resolveId(id: string) {
          if (id === 'jsonwebtoken') return path.resolve(__dirname, 'src/shims/jsonwebtoken.ts');
        },
      },
      react(),
      nodePolyfills({ include: ['buffer', 'process', 'crypto', 'stream', 'util'] }),
      devApi(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        jsonwebtoken: path.resolve(__dirname, 'src/shims/jsonwebtoken.ts'),
      },
    },
    optimizeDeps: {
      include: ['@circle-fin/w3s-pw-web-sdk'],
      esbuildOptions: {
        alias: {
          jsonwebtoken: path.resolve(__dirname, 'src/shims/jsonwebtoken.ts'),
        },
      },
    },
    server: { port: 5174 },
  };
});
