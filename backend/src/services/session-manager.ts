import { randomUUID } from 'crypto';
import DatabaseService from '../db/database';
import SessionPersistence from './session-persistence';
import type { Session, SessionStatus } from '../types';

class SessionManager {
  private persistence: SessionPersistence;

  constructor(private db: DatabaseService) {
    this.persistence = new SessionPersistence(db);
  }

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
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    this.db.saveSession(session);
    this.persistence.logSessionCreated(session);
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
    this.persistence.logStatusChange(id, 'active', 'switched');
    return session;
  }

  pauseSession(id: string): void {
    const session = this.db.getSession(id);
    if (session) {
      session.status = 'paused';
      session.updatedAt = Date.now();
      this.db.saveSession(session);
      this.persistence.logSessionPaused(id);
    }
  }

  resumeSession(id: string): void {
    const session = this.db.getSession(id);
    if (session) {
      session.status = 'active';
      session.updatedAt = Date.now();
      this.db.saveSession(session);
      this.persistence.logSessionResumed(id);
    }
  }

  closeSession(id: string, summary?: string): void {
    const session = this.db.getSession(id);
    if (session) {
      session.status = 'completed';
      if (summary) {
        session.lastSummary = summary;
      }
      session.updatedAt = Date.now();
      this.db.saveSession(session);
      this.persistence.logSessionCompleted(id, summary);
    }
  }

  updateSessionStatus(id: string, status: SessionStatus): void {
    this.db.updateSessionStatus(id, status);
    this.persistence.logStatusChange(id, status);
  }

  updateSessionSummary(id: string, summary: string): void {
    this.db.updateSessionSummary(id, summary);
    this.persistence.logHistory(id, 'summary_updated', { summary });
  }

  deleteSession(id: string): void {
    this.db.deleteSession(id);
  }

  getSessionCount(): number {
    return this.db.getSessionCount();
  }

  // Persistence methods
  getPersistence(): SessionPersistence {
    return this.persistence;
  }

  async restoreSessionsOnStartup(): Promise<Session[]> {
    return this.persistence.restoreOnStartup();
  }

  async archiveSession(id: string): Promise<void> {
    return this.persistence.archiveSession(id);
  }

  async getArchivedSessions(limit?: number): Promise<any[]> {
    return this.persistence.getArchivedSessions(limit);
  }

  async restoreFromArchive(id: string): Promise<Session | null> {
    return this.persistence.restoreFromArchive(id);
  }

  async clearOldSessions(daysOld: number): Promise<number> {
    return this.persistence.clearOldSessions(daysOld);
  }

  async getSessionHistory(id: string, limit?: number): Promise<any[]> {
    return this.persistence.getSessionHistory(id, limit);
  }

  async getSessionWithHistory(id: string): Promise<any> {
    return this.persistence.getSessionWithHistory(id);
  }
}

export default SessionManager;
