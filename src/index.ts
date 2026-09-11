import { webhookCallback } from 'grammy';
import { Env } from './types';
import { createBot } from './bot';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!env.BOT_TOKEN) {
      return new Response('BOT_TOKEN is not configured.', { status: 500 });
    }

    const bot = createBot(env);

    // Health check endpoint
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('Traitor Radar Cloudflare Worker is running.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Webhook setup endpoint: call once after deployment
    if (request.method === 'GET' && url.pathname === '/set-webhook') {
      const webhookUrl = `${url.origin}/webhook`;
      try {
        const result = await bot.api.setWebhook(webhookUrl, {
          allowed_updates: ['message', 'chat_member', 'my_chat_member'],
          secret_token: env.SECRET_TOKEN,
          drop_pending_updates: false,
        });

        return new Response(
          JSON.stringify({
            success: true,
            webhookUrl,
            telegram_response: result,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: err?.message || String(err),
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Telegram webhook handler
    if (request.method === 'POST' && url.pathname === '/webhook') {
      const handleUpdate = webhookCallback(bot, 'cloudflare-mod', {
        secretToken: env.SECRET_TOKEN,
      });
      return handleUpdate(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
