import { Hono } from 'hono'
import { cors  } from 'hono/cors'
import { logger } from 'hono/logger'

import authRoutes from './routes/authRoutes'
import documentRoutes from './routes/documentRoutes'
import chatRoutes from './routes/chatRoutes'

const app = new Hono()

// Global Middlewares
app.use('*', logger()); 
app.use('*', cors({
  origin: Bun.env.FRONTEND_URL || 'http://localhost:8081', 
  credentials: true,
}));
app.route("/api/auth", authRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/chats", chatRoutes);

app.onError((err, c) => {
  console.error(`[Server Error]: ${err.message}`);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

Bun.serve({
  port: 3000,
  fetch: app.fetch,
  // NDJSON chat streams can sit idle for several seconds while Gemini warms
  // up its first token. The 10s default would kill the body before any delta
  // arrives. 60s is generous for a slow cold start without hiding real hangs.
  idleTimeout: 60,
})

console.log('Server running on http://localhost:3000')