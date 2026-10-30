import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { encryptSecret, decryptSecret } from '../../utils/crypto';

export class TelegramIntegrationService {
  public isBotTokenConfiguredOnServer(): boolean {
    return Boolean(
      env.TELEGRAM_BOT_TOKEN &&
        env.TELEGRAM_BOT_TOKEN.trim() !== '' &&
        env.TELEGRAM_BOT_TOKEN !== 'your_telegram_botfather_token'
    );
  }

  private async callTelegramApi(botToken: string, method: string, body?: Record<string, any>) {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data: any;
    try {
      data = await res.json();
    } catch (_e) {
      throw new AppError(
        `Telegram API returned non-JSON response (${res.status})`,
        502,
        'TELEGRAM_API_ERROR'
      );
    }

    if (!res.ok || !data.ok) {
      throw new AppError(
        `Telegram Bot API error: ${data.description || 'Invalid bot token or request rejected'}`,
        400,
        'TELEGRAM_API_ERROR'
      );
    }

    return data.result;
  }

  public async connectBot(userId: string, providedBotToken?: string, linkedChatId?: string) {
    const existing = await prisma.telegramConnection.findFirst({
      where: { userId },
    });

    const savedToken = existing?.encryptedBotToken
      ? decryptSecret(existing.encryptedBotToken)
      : '';

    const tokenToUse = (
      providedBotToken ||
      savedToken ||
      env.TELEGRAM_BOT_TOKEN ||
      ''
    ).trim();

    if (!tokenToUse || tokenToUse === 'your_telegram_botfather_token') {
      throw new AppError(
        'TELEGRAM_BOT_TOKEN is not configured. Please add TELEGRAM_BOT_TOKEN in backend/.env or paste your @BotFather token.',
        400,
        'TELEGRAM_TOKEN_REQUIRED'
      );
    }

    // 1. Validate bot via real Telegram Bot API getMe
    const botInfo = await this.callTelegramApi(tokenToUse, 'getMe');
    const encryptedBotToken = encryptSecret(tokenToUse);

    let resolvedChatId: string | null = existing?.linkedChatId || null;
    let resolvedChatTitle: string | null = existing?.linkedChatTitle || null;

    if (linkedChatId && String(linkedChatId).trim()) {
      // User explicitly passed a chat_id -> validate via real getChat
      const explicitId = String(linkedChatId).trim();
      const chatInfo = await this.callTelegramApi(tokenToUse, 'getChat', {
        chat_id: explicitId,
      });
      resolvedChatId = String(chatInfo.id || explicitId);
      resolvedChatTitle =
        chatInfo.title ||
        (chatInfo.username ? `@${chatInfo.username}` : null) ||
        chatInfo.first_name ||
        `Chat ${resolvedChatId}`;
    } else {
      // Auto-discover latest /start or message sent to the bot via getUpdates
      try {
        const updates = await this.callTelegramApi(tokenToUse, 'getUpdates', {
          limit: 20,
        });
        if (Array.isArray(updates) && updates.length > 0) {
          for (let i = updates.length - 1; i >= 0; i--) {
            const msg = updates[i]?.message || updates[i]?.my_chat_member;
            if (msg?.chat?.id) {
              resolvedChatId = String(msg.chat.id);
              resolvedChatTitle =
                msg.chat.title ||
                (msg.chat.username ? `@${msg.chat.username}` : null) ||
                msg.chat.first_name ||
                `Chat ${resolvedChatId}`;
              break;
            }
          }
        }
      } catch (_e) {
        // Ignore if getUpdates is blocked by an active webhook
      }
    }

    let connection;
    if (existing) {
      connection = await prisma.telegramConnection.update({
        where: { id: existing.id },
        data: {
          encryptedBotToken,
          botUsername: botInfo.username || 'anavya_bot',
          botId: String(botInfo.id),
          botFirstName: botInfo.first_name || 'Anavya Bot',
          linkedChatId: resolvedChatId,
          linkedChatTitle: resolvedChatTitle,
          status: 'connected',
          lastConnectedAt: new Date(),
        },
      });
    } else {
      connection = await prisma.telegramConnection.create({
        data: {
          userId,
          encryptedBotToken,
          botUsername: botInfo.username || 'anavya_bot',
          botId: String(botInfo.id),
          botFirstName: botInfo.first_name || 'Anavya Bot',
          linkedChatId: resolvedChatId,
          linkedChatTitle: resolvedChatTitle,
          status: 'connected',
          lastConnectedAt: new Date(),
        },
      });
    }

    const existingAcc = await prisma.connectedAccount.findFirst({
      where: { userId, provider: 'telegram' },
    });
    if (existingAcc) {
      await prisma.connectedAccount.update({
        where: { id: existingAcc.id },
        data: {
          accountName: `@${connection.botUsername}`,
          status: 'connected',
          scopes: ['bot:getMe', 'bot:sendMessage', 'bot:getChat'],
          lastConnectedAt: new Date(),
        },
      });
    } else {
      await prisma.connectedAccount.create({
        data: {
          userId,
          provider: 'telegram',
          accountName: `@${connection.botUsername}`,
          status: 'connected',
          scopes: ['bot:getMe', 'bot:sendMessage', 'bot:getChat'],
          lastConnectedAt: new Date(),
        },
      });
    }

    return {
      connected: true,
      botId: connection.botId,
      botUsername: connection.botUsername,
      botFirstName: connection.botFirstName,
      linkedChatId: connection.linkedChatId,
      linkedChatTitle: connection.linkedChatTitle,
      lastConnectedAt: connection.lastConnectedAt,
    };
  }

  public async linkChat(userId: string, chatId: string) {
    const conn = await prisma.telegramConnection.findFirst({
      where: { userId, status: 'connected' },
    });

    if (!conn) {
      throw new AppError(
        'Telegram bot is not connected. Connect your Telegram bot first.',
        400,
        'TELEGRAM_NOT_CONNECTED'
      );
    }

    const botToken = decryptSecret(conn.encryptedBotToken);
    const cleanedChatId = String(chatId).trim();
    if (!cleanedChatId) {
      throw new AppError('Valid Telegram chatId is required', 400, 'INVALID_CHAT_ID');
    }

    const chatInfo = await this.callTelegramApi(botToken, 'getChat', {
      chat_id: cleanedChatId,
    });

    const chatTitle =
      chatInfo.title || chatInfo.username || chatInfo.first_name || `Chat ${cleanedChatId}`;

    const updated = await prisma.telegramConnection.update({
      where: { id: conn.id },
      data: {
        linkedChatId: String(chatInfo.id || cleanedChatId),
        linkedChatTitle: chatTitle,
      },
    });

    return {
      linked: true,
      linkedChatId: updated.linkedChatId,
      linkedChatTitle: updated.linkedChatTitle,
      botUsername: updated.botUsername,
    };
  }

  public async getStatus(userId: string) {
    const conn = await prisma.telegramConnection.findFirst({
      where: { userId },
    });

    if (conn && conn.encryptedBotToken) {
      try {
        const raw = decryptSecret(conn.encryptedBotToken);
        if (raw === 'anavya_phone_session') {
          await this.disconnect(userId);
          return {
            connected: false,
            provider: 'telegram',
            serverBotConfigured: this.isBotTokenConfiguredOnServer(),
            botUsername: null,
            linkedChatId: null,
            linkedChatTitle: null,
            permissions: ['telegram.get_bot_info', 'telegram.get_chat_info', 'telegram.send_message'],
          };
        }
      } catch (_e) {
        // Ignore decrypt error
      }
    }

    if (!conn || conn.status !== 'connected') {
      return {
        connected: false,
        provider: 'telegram',
        serverBotConfigured: this.isBotTokenConfiguredOnServer(),
        botUsername: null,
        linkedChatId: null,
        linkedChatTitle: null,
        permissions: ['telegram.get_bot_info', 'telegram.get_chat_info', 'telegram.send_message'],
      };
    }

    return {
      connected: true,
      provider: 'telegram',
      serverBotConfigured: this.isBotTokenConfiguredOnServer(),
      botId: conn.botId,
      botUsername: conn.botUsername,
      botFirstName: conn.botFirstName,
      linkedChatId: conn.linkedChatId,
      linkedChatTitle: conn.linkedChatTitle,
      lastConnectedAt: conn.lastConnectedAt,
      permissions: ['telegram.get_bot_info', 'telegram.get_chat_info', 'telegram.send_message'],
    };
  }

  public async getBotInfo(userId: string) {
    const conn = await prisma.telegramConnection.findFirst({
      where: { userId, status: 'connected' },
    });
    if (!conn) {
      throw new AppError('Telegram bot is not connected', 400, 'TELEGRAM_NOT_CONNECTED');
    }
    const token = decryptSecret(conn.encryptedBotToken);
    const me = await this.callTelegramApi(token, 'getMe');
    return {
      id: String(me.id),
      username: me.username,
      firstName: me.first_name,
      canJoinGroups: me.can_join_groups,
    };
  }

  public async getChatInfo(userId: string, chatId?: string) {
    const conn = await prisma.telegramConnection.findFirst({
      where: { userId, status: 'connected' },
    });
    if (!conn) {
      throw new AppError('Telegram bot is not connected', 400, 'TELEGRAM_NOT_CONNECTED');
    }
    const targetChatId = chatId || conn.linkedChatId;
    if (!targetChatId) {
      throw new AppError(
        'No Telegram chat is linked yet. Open your bot in Telegram, press Start, and click Verify.',
        400,
        'TELEGRAM_CHAT_NOT_LINKED'
      );
    }
    if (String(targetChatId) !== String(conn.linkedChatId)) {
      throw new AppError(
        'Security restriction: Can only access the Telegram chatId explicitly linked to your user account.',
        403,
        'UNAUTHORIZED_TELEGRAM_CHAT'
      );
    }

    const token = decryptSecret(conn.encryptedBotToken);
    const chat = await this.callTelegramApi(token, 'getChat', { chat_id: targetChatId });
    return {
      chatId: String(chat.id),
      title: chat.title || chat.username || chat.first_name || 'Linked Chat',
      type: chat.type,
    };
  }

  public async sendMessage(userId: string, text: string, requestedChatId?: string) {
    const conn = await prisma.telegramConnection.findFirst({
      where: { userId, status: 'connected' },
    });

    if (!conn) {
      throw new AppError(
        'Telegram is not connected. Please connect your Telegram bot in Plugins first.',
        400,
        'TELEGRAM_NOT_CONNECTED'
      );
    }

    const token = decryptSecret(conn.encryptedBotToken);
    if (!token || token === 'anavya_phone_session') {
      throw new AppError(
        'A real @BotFather token is required to send live Telegram messages. Please disconnect and connect with a valid Bot Token.',
        400,
        'TELEGRAM_TOKEN_REQUIRED'
      );
    }

    let chatIdToUse = conn.linkedChatId;

    // If linkedChatId wasn't discovered yet, try auto-discovering via getUpdates right now!
    if (!chatIdToUse) {
      const refreshed = await this.connectBot(userId);
      chatIdToUse = refreshed.linkedChatId;
    }

    if (!chatIdToUse) {
      throw new AppError(
        `Your Telegram Bot (@${conn.botUsername}) is connected, but you haven't messaged it yet! Open @${conn.botUsername} in Telegram, tap "Start", and try again.`,
        400,
        'TELEGRAM_CHAT_NOT_LINKED'
      );
    }

    if (requestedChatId && String(requestedChatId) !== String(chatIdToUse)) {
      throw new AppError(
        `Security restriction: Requested chatId '${requestedChatId}' does not match your linked Telegram chat '${chatIdToUse}'.`,
        403,
        'UNAUTHORIZED_TELEGRAM_CHAT'
      );
    }

    const result = await this.callTelegramApi(token, 'sendMessage', {
      chat_id: chatIdToUse,
      text,
    });

    return {
      delivered: true,
      messageId: result.message_id,
      chatId: String(result.chat?.id || chatIdToUse),
      chatTitle: conn.linkedChatTitle || result.chat?.title || result.chat?.first_name,
      sentAt: new Date().toISOString(),
    };
  }

  public async handleWebhook(secretHeader: string | undefined, updatePayload: any) {
    if (!secretHeader || secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
      throw new AppError('Invalid Telegram webhook secret token', 401, 'INVALID_WEBHOOK_SECRET');
    }

    const msg = updatePayload?.message;
    if (msg && msg.text && msg.chat?.id) {
      const text = String(msg.text).trim();
      if (text.startsWith('/link ')) {
        const userId = text.replace('/link ', '').trim();
        const conn = await prisma.telegramConnection.findFirst({
          where: { userId, status: 'connected' },
        });
        if (conn) {
          await prisma.telegramConnection.update({
            where: { id: conn.id },
            data: {
              linkedChatId: String(msg.chat.id),
              linkedChatTitle:
                msg.chat.title || msg.chat.username || msg.chat.first_name || 'Linked Chat',
            },
          });
          return { linked: true, chatId: String(msg.chat.id), userId };
        }
      }
    }

    return { received: true };
  }

  public async disconnect(userId: string) {
    await prisma.telegramConnection.deleteMany({
      where: { userId },
    });
    await prisma.connectedAccount.updateMany({
      where: { userId, provider: 'telegram' },
      data: { status: 'disconnected' },
    });
    return { disconnected: true };
  }
}

export const telegramIntegrationService = new TelegramIntegrationService();
