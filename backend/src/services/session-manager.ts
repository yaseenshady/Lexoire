import { randomUUID } from 'crypto';
import DatabaseService from '../db/database';
import type { Session, SessionStatus } from '../types';

class SessionManager {
  constructor(private db: DatabaseService) {}

  createSession(name: string, repoPath: string, branch?: string): Session {
    const now = Date.now();
    const session: Session = {
      id: `session-${randomUUID()}`,
      name,
      copilotSessionId: `copilot-${randomUUID()}`,
      repoPath,
      branch,
      status: 'idle',
      objective: undefined,
      lastSummary: undefined,
      focusLevel: 0,
      createdAt: now,
      updatedAt: now
    };

    this.db.saveSession(session);
    return session;
  }

  listSessions(): Session[] {
    return this.db.getAllSessions();
  }

  getSession(id: string): Session | null {
    return this.db.getSession(id);
  }

  switchSession(id: string): Session | null {
    const session = this.db.getSession(id);
    if (!session) {
      return null;
    }

    session.status = 'active';
    session.updatedAt = Date.now();
    this.db.saveSession(session);
    return session;
  }

  pauseSession(id: string): void {
    const session = this.db.getSession(id);
    if (session) {
      session.status = 'paused';
      session.updatedAt = Date.now();
      this.db.saveSession(session);
    }
  }

  resumeSession(id: string): void {
    const session = this.db.getSession(id);
    if (session) {
      session.status = 'active';
      session.updatedAt = Date.now();
      this.db.saveSession(session);
    }
  }

  closeSession(id: string): void {
    const session = this.db.getSession(id);
    if (session) {
      session.status = 'completed';
      session.updatedAt = Date.now();
      this.db.saveSession(session);
    }
  }

  updateSessionStatus(id: string, status: SessionStatus): void {
    this.db.updateSessionStatus(id, status);
  }

  updateSessionSummary(id: string, summary: string): void {
    this.db.updateSessionSummary(id, summary);
  }

  deleteSession(id: string): void {
    this.db.deleteSession(id);
  }

  getSessionCount(): number {
    return this.db.getSessionCount();
  }
}

export default SessionManager;
