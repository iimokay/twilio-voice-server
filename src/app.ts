import dotenv from 'dotenv';
import http from 'http';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import serve from 'koa-static';
import path from 'path';
import WebSocket from 'ws';
import { VoiceController } from './controllers/voiceController';
import voiceRoutes from './routes/voiceRoutes';
import { env } from './env';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Validate required environment variables
const requiredEnvVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Initialize Koa application
const app = new Koa();

// Initialize voice controller
const voiceController = VoiceController.getInstance();

// Middleware
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
      message: process.env.NODE_ENV === 'development' ? (error as Error).message : 'An unexpected error occurred'
    };
  }
});

// Routes
app.use(voiceRoutes.routes());
app.use(voiceRoutes.allowedMethods());

// Create HTTP server
const server = http.createServer(app.callback());

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      await voiceController.handleStreamData(data, ws);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({
        error: 'Failed to process message',
        message: (error as Error).message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
// Start server
server.listen(env.port, () => {
  console.log(`🚀 Server is running on port ${env.port}`);
}); 