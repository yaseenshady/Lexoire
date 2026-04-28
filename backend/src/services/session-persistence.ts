import DatabaseService from '../db/database';
import type { Session, SessionStatus } from '../types';

export interface HistoryEntry {
  id: number;
  action: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface ArchivedSession {
  id: string;
  name: string;
  copilotSessionId: string;
  repoPath: string;
  objective?: string;
  finalSummary?: string;
  createdAt: number;
  completedAt: number;
}

class SessionPersistence {
  constructor(private db: DatabaseService) {}

  /**
   * Save session state including metadata
   */
  saveSession(session: Session): Promise<void> {
    return Promise.resolve().then(() => {
      this.db.saveSession(session);
      this.logHistory(session.id, 'session_saved', { name: session.name, status: session.status });
    });
  }

  /**
   * Load all non-completed sessions
   */
  async loadSessions(): Promise<Session[]> {
    return this.db.getRestorableSessions();
  }

  /**
   * Archive a completed session
   */
  async archiveSession(id: string): Promise<void> {
    this.db.archiveSession(id);
  }

  /**
   * Restore a session from archive
   */
  async restoreFromArchive(id: string): Promise<Session | null> {
    this.db.restoreFromArchive(id);
    return this.db.getSession(id);
  }

  /**
   * Get archived sessions
   */
  async getArchivedSessions(limit?: number): Promise<ArchivedSession[]> {
    return this.db.getArchivedSessions(limit);
  }

  /**
   * Delete an archived session permanently
   */
  async deleteArchived(id: string): Promise<void> {
    this.db.deleteArchivedSession(id);
  }

  /**
   * Clear old sessions that have been completed for N days
   */
  async clearOldSessions(daysOld: number): Promise<number> {
    return this.db.clearOldSessions(daysOld);
  }

  /**
   * Get session history
   */
  async getSessionHistory(id: string, limit?: number): Promise<HistoryEntry[]> {
    return this.db.getSessionHistory(id, limit);
  }

  /**
   * Log a session action to history
   */
  logHistory(sessionId: string, action: string, details?: Record<string, unknown>): void {
    this.db.logSessionHistory(sessionId, action, details);
  }

  /**
   * Log session creation
   */
  logSessionCreated(session: Session): void {
    this.logHistory(session.id, 'created', {
      name: session.name,
      repoPath: session.repoPath,
      objective: session.objective
    });
  }

  /**
   * Log session status change
   */
  logStatusChange(sessionId: string, newStatus: SessionStatus, reason?: string): void {
    this.logHistory(sessionId, 'status_changed', {
      newStatus,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Log session resumed
   */
  logSessionResumed(sessionId: string): void {
    this.logHistory(sessionId, 'resumed', { timestamp: Date.now() });
  }

  /**
   * Log session paused
   */
  logSessionPaused(sessionId: string, reason?: string): void {
    this.logHistory(sessionId, 'paused', { reason, timestamp: Date.now() });
  }

  /**
   * Log session completed
   */
  logSessionCompleted(sessionId: string, summary?: string): void {
    this.logHistory(sessionId, 'completed', {
      summary,
      timestamp: Date.now()
    });
  }

  /**
   * Get all non-completed sessions for auto-restore on startup
   */
  async getSessionsForAutoRestore(): Promise<Session[]> {
    const sessions = await this.loadSessions();
    return sessions.filter((s) => s.status !== 'completed');
  }

  /**
   * Restore sessions on app startup
   */
  async restoreOnStartup(): Promise<Session[]> {
    try {
      const sessionsToRestore = await this.getSessionsForAutoRestore();
      return sessionsToRestore;
    } catch (error) {
      console.error('Error restoring sessions on startup:', error);
      return [];
    }
  }

  /**
   * Update session metadata
   */
  async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    const session = this.db.getSession(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
      this.db.saveSession(session);
      this.logHistory(sessionId, 'metadata_updated', metadata);
    }
  }

  /**
   * Get session with full history
   */
  async getSessionWithHistory(sessionId: string): Promise<{
    session: Session | null;
    history: HistoryEntry[];
  }> {
    const session = this.db.getSession(sessionId);
    const history = this.db.getSessionHistory(sessionId);

    return {
      session,
      history
    };
  }
}

export default SessionPersistence;
