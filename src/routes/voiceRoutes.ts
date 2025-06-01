import Router from '@koa/router';
import { VoiceController } from '../controllers/voiceController';

const router = new Router({
  prefix: '/api'
});

const voiceController = VoiceController.getInstance();

// Voice endpoint
router.post('/voice', async (ctx) => {
  await voiceController.handleIncomingCall(ctx);
});

export default router; 