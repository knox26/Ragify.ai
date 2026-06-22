import { Hono } from 'hono'
import { cors  } from 'hono/cors'
import { logger } from 'hono/logger'

import authRoutes from './routes/authRoutes'
import documentRoutes from './routes/documentRoutes'

const app = new Hono()

// Global Middlewares
app.use('*', logger()); 
app.use('*', cors({
  origin: Bun.env.FRONTEND_URL || 'http://localhost:8081', 
  credentials: true,
}));
app.route("/api/auth", authRoutes);
app.route("/api/documents", documentRoutes);

app.onError((err, c) => {
  console.error(`[Server Error]: ${err.message}`);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

Bun.serve({
  port: 3000,
  fetch: app.fetch,
})

console.log('Server running on http://localhost:3000')