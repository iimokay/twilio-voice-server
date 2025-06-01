import Router from '@koa/router';

const router = new Router({
  prefix: '/api',
});

// Voice endpoint
router.post('/voice', async ctx => {
  try {
    const host = ctx.hostname;
    const streamUrl = `wss://${host}/stream`;
    console.log(`Handling incoming call with stream URL: ${streamUrl}`);
    ctx.type = 'text/xml';
    ctx.body = `<Response>
    <Say>Hello, this is a test call.</Say>
    <Connect>
      <Stream url="${streamUrl}" />
    </Connect>
  </Response>`;

    console.log('Successfully generated TwiML response');
  } catch (error) {
    console.error('Failed to handle incoming call:', error);
    ctx.type = 'text/xml';
    ctx.body = `<Response>
    <Say>Failed to handle incoming call.</Say>
  </Response>`;
  }
});
export default router;
