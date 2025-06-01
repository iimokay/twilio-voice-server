import http from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import serve from 'koa-static';
import path from 'path';
import WebSocket from 'ws';
import { env } from './env';
import httpRoutes from './routes/httpRoutes';
import { VoiceService } from './services/voiceService';

// Initialize Koa application
const app = new Koa();

// Initialize voice controller
const voiceService = VoiceService.getInstance();

// Middleware·
app.use(bodyParser());
app.use(serve(path.join(__dirname, '../public')));

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Unhandled error:', error);
    ctx.status = 500;
    ctx.body = {
      error: 'Internal server error',
      message: (error as Error).message,
    };
  }
});

// Routes
app.use(httpRoutes.routes());
app.use(httpRoutes.allowedMethods());

// Create HTTP server
const server = http.createServer(app.callback());

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handler
wss.on('connection', async (ws, req) => {
  console.log('🔗 WebSocket client connected', req.url);
  if (req.url?.includes('/user/')) {
    const streamSid = req.url.replace('/user/', '') ?? 'general-stream';
    await voiceService.handleStreamData(
      {
        event: 'start',
        streamSid,
        start: {
          accountSid: streamSid,
          mediaFormat: {
            encoding: 'pcm',
            sampleRate: 16000,
            channels: 1,
          },
          tracks: ['user_audio_input'],
          callSid: streamSid,
          customParameters: {},
        },
      },
      ws
    );
  }

  ws.on('message', async message => {
    try {
      const data = JSON.parse(message.toString());
      await voiceService.handleStreamData(data, ws);
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  });
  ws.on('close', () => {
    console.log('⛓️‍💥 WebSocket client disconnected');
  });

  ws.on('error', error => {
    console.error('❌ WebSocket error:', error);
  });
});
// Start server
server.listen(env.port, () => {
  console.log(`🚀 Server is running on port ${env.port}`);
});
