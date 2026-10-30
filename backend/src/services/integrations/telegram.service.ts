import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { encryptSecret, decryptSecret } from '../../utils/crypto';

export class TelegramIntegrationService {
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
      throw new AppError(`Telegram API returned non-JSON response (${res.status})`, 502, 'TELEGRAM_API_ERROR');
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
    const tokenToUse = (providedBotToken || env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!tokenToUse || tokenToUse === 'your_telegram_botfather_token') {
      throw new AppError(
        'A valid Telegram Bot token from @BotFather is required.',
        400,
        'TELEGRAM_TOKEN_REQUIRED'
      );
    }

    // Validate bot via real Telegram Bot API getMe
    const botInfo = await this.callTelegramApi(tokenToUse, 'getMe');
    const encryptedBotToken = encryptSecret(tokenToUse);

    let resolvedChatId = linkedChatId ? String(linkedChatId).trim() : null;
    let resolvedChatTitle: string | null = null;

    if (resolvedChatId) {
      const chatInfo = await this.callTelegramApi(tokenToUse, 'getChat', {
        chat_id: resolvedChatId,
      });
      resolvedChatTitle =
        chatInfo.title || chatInfo.username || chatInfo.first_name || `Chat ${resolvedChatId}`;
    }

    const existing = await prisma.telegramConnection.findFirst({
      where: { userId },
    });

    let connection;
    if (existing) {
      connection = await prisma.telegramConnection.update({
        where: { id: existing.id },
        data: {
          encryptedBotToken,
          botUsername: botInfo.username || 'taskforce_bot',
          botId: String(botInfo.id),
          botFirstName: botInfo.first_name || 'TaskForce Bot',
          ...(resolvedChatId ? { linkedChatId: resolvedChatId, linkedChatTitle: resolvedChatTitle } : {}),
          status: 'connected',
          lastConnectedAt: new Date(),
        },
      });
    } else {
      connection = await prisma.telegramConnection.create({
        data: {
          userId,
          encryptedBotToken,
          botUsername: botInfo.username || 'taskforce_bot',
          botId: String(botInfo.id),
          botFirstName: botInfo.first_name || 'TaskForce Bot',
          linkedChatId: resolvedChatId,
          linkedChatTitle: resolvedChatTitle,
          status: 'connected',
          lastConnectedAt: new Date(),
        },
      });
    }

    // Mirror in ConnectedAccount table for unified integration status
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

    if (!conn || conn.status !== 'connected') {
      return {
        connected: false,
        provider: 'telegram',
        botUsername: null,
        linkedChatId: null,
        linkedChatTitle: null,
        permissions: ['telegram.get_bot_info', 'telegram.get_chat_info', 'telegram.send_message'],
      };
    }

    return {
      connected: true,
      provider: 'telegram',
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
      throw new AppError('No Telegram chat is linked to this account', 400, 'TELEGRAM_CHAT_NOT_LINKED');
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
        'Telegram is not connected. Please connect your Telegram bot in Connected Apps.',
        400,
        'TELEGRAM_NOT_CONNECTED'
      );
    }

    if (!conn.linkedChatId) {
      throw new AppError(
        'Telegram chat is not linked. Please link your Telegram Chat ID in Connected Apps.',
        400,
        'TELEGRAM_CHAT_NOT_LINKED'
      );
    }

    if (requestedChatId && String(requestedChatId) !== String(conn.linkedChatId)) {
      throw new AppError(
        `Security restriction: Requested chatId '${requestedChatId}' does not match your linked Telegram chat '${conn.linkedChatId}'.`,
        403,
        'UNAUTHORIZED_TELEGRAM_CHAT'
      );
    }

    const token = decryptSecret(conn.encryptedBotToken);
    const result = await this.callTelegramApi(token, 'sendMessage', {
      chat_id: conn.linkedChatId,
      text,
    });

    return {
      delivered: true,
      messageId: result.message_id,
      chatId: String(result.chat?.id || conn.linkedChatId),
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
      // Support "/link <userId>" command from Telegram user to auto-link chat
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
              linkedChatTitle: msg.chat.title || msg.chat.username || msg.chat.first_name || 'Linked Chat',
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

