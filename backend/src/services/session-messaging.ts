import DatabaseService from '../db/database';
import type { SessionMessage, SessionContextShare } from '../types';

class SessionMessaging {
  constructor(private db: DatabaseService) {}

  sendMessage(fromSessionId: string, toSessionId: string, message: string): SessionMessage {
    const now = Date.now();
    const id = this.db.saveSessionMessage({
      id: 0,
      fromSessionId,
      toSessionId,
      message: message.trim(),
      createdAt: now
    });

    return {
      id,
      fromSessionId,
      toSessionId,
      message: message.trim(),
      createdAt: now
    };
  }

  shareContext(
    fromSessionId: string,
    toSessionId: string,
    context: Record<string, unknown>,
    contextType: 'objective' | 'summary' | 'metadata' | 'custom' = 'custom'
  ): SessionContextShare {
    const now = Date.now();
    const id = this.db.saveSessionContextShare({
      fromSessionId,
      toSessionId,
      context,
      contextType,
      createdAt: now
    });

    return {
      id,
      fromSessionId,
      toSessionId,
      context,
      contextType,
      createdAt: now
    };
  }

  getMessages(sessionId: string, limit: number = 50): SessionMessage[] {
    return this.db.getSessionMessages(sessionId, limit);
  }

  getContextShares(sessionId: string, limit: number = 50): SessionContextShare[] {
    return this.db.getSessionContextShares(sessionId, limit);
  }
}

export default SessionMessaging;
