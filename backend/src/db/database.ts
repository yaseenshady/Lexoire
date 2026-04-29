import Database from 'better-sqlite3';
import type { Conversation, Memory, Message, ProjectPlan, ProjectStep, Session, SessionStatus, SessionMessage, SessionContextShare } from '../types';

type ConversationRow = {
  id: string;
  title: string;
  project_id: string | null;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: Message['role'];
  content: string;
  timestamp: number;
  metadata: string | null;
};

type MemoryRow = {
  id: string;
  conversation_id: string;
  content: string;
  importance: number;
  tags: string;
  created_at: number;
};

type ProjectPlanRow = {
  id: string;
  title: string;
  description: string;
  status: ProjectPlan['status'];
  created_at: number;
  updated_at: number;
};

type ProjectStepRow = {
  id: string;
  description: string;
  status: ProjectStep['status'];
  output: string | null;
  error: string | null;
  step_order: number;
};

type SessionRow = {
  id: string;
  name: string;
  copilot_session_id: string;
  repo_path: string;
  branch: string | null;
  status: SessionStatus;
  objective: string | null;
  last_summary: string | null;
  focus_level: number;
  metadata: string | null;
  created_at: number;
  updated_at: number;
};

type SessionArchiveRow = {
  id: string;
  name: string;
  copilot_session_id: string;
  repo_path: string;
  objective: string | null;
  final_summary: string | null;
  created_at: number;
  completed_at: number;
};

type SessionHistoryRow = {
  id: number;
  session_id: string;
  action: string;
  details: string | null;
  timestamp: number;
};

type SessionMessageRow = {
  id: number;
  from_session_id: string;
  to_session_id: string;
  message: string;
  created_at: number;
};

type SessionContextShareRow = {
  id: number;
  from_session_id: string;
  to_session_id: string;
  context: string;
  context_type: 'objective' | 'summary' | 'metadata' | 'custom';
  created_at: number;
};

class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL NOT NULL,
        tags TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_plans (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        step_order INTEGER NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES project_plans(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        copilot_session_id TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        branch TEXT,
        status TEXT CHECK(status IN ('idle', 'thinking', 'active', 'paused', 'completed')) DEFAULT 'idle',
        objective TEXT,
        last_summary TEXT,
        focus_level INTEGER DEFAULT 0,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_archive (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        copilot_session_id TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        objective TEXT,
        final_summary TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_session_id TEXT NOT NULL,
        to_session_id TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(from_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(to_session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_context_share (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_session_id TEXT NOT NULL,
        to_session_id TEXT NOT NULL,
        context TEXT NOT NULL,
        context_type TEXT NOT NULL CHECK(context_type IN ('objective', 'summary', 'metadata', 'custom')),
        created_at INTEGER NOT NULL,
        FOREIGN KEY(from_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(to_session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_memories_conversation ON memories(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_steps_plan ON project_steps(plan_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_plans_updated_at ON project_plans(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_archive_created_at ON session_archive(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_history_session ON session_history(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_history_timestamp ON session_history(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_session_messages_from ON session_messages(from_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_messages_to ON session_messages(to_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_context_share_from ON session_context_share(from_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_context_share_to ON session_context_share(to_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_context_share_created_at ON session_context_share(created_at DESC);
    `);

    this.ensureColumn('messages', 'metadata', 'TEXT');
    this.ensureColumn('sessions', 'metadata', 'TEXT');
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const hasColumn = rows.some((row) => row.name === column);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private parseMetadata(metadata: string | null): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }

    return JSON.parse(metadata) as Record<string, unknown>;
  }

  private mapConversation(conv: ConversationRow, messages: MessageRow[]): Conversation {
    return {
      id: conv.id,
      title: conv.title,
      projectId: conv.project_id ?? undefined,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        metadata: this.parseMetadata(message.metadata)
      }))
    };
  }

  private mapMemory(memory: MemoryRow): Memory {
    return {
      id: memory.id,
      conversationId: memory.conversation_id,
      content: memory.content,
      importance: memory.importance,
      tags: JSON.parse(memory.tags) as string[],
      createdAt: memory.created_at
    };
  }

  private mapProjectPlan(plan: ProjectPlanRow, steps: ProjectStepRow[]): ProjectPlan {
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
      steps: steps
        .sort((left, right) => left.step_order - right.step_order)
        .map((step) => ({
          id: step.id,
          description: step.description,
          status: step.status,
          output: step.output ?? undefined,
          error: step.error ?? undefined
        }))
    };
  }

  private buildMemoryTags(message: Message): string[] {
    const normalized = message.content.toLowerCase();
    const tags = new Set<string>(['conversation', message.role]);

    const keywordMatchers: Array<[string, RegExp]> = [
      ['bugfix', /\b(error|bug|fix|stack trace|failed?)\b/],
      ['planning', /\b(plan|roadmap|steps|milestone)\b/],
      ['build', /\b(build|deploy|release|compile)\b/],
      ['code', /\b(component|typescript|javascript|react|api|backend|frontend|database)\b/],
      ['memory', /\b(remember|memory|context|history)\b/]
    ];

    for (const [tag, matcher] of keywordMatchers) {
      if (matcher.test(normalized)) {
        tags.add(tag);
      }
    }

    return Array.from(tags);
  }

  private scoreMemoryImportance(message: Message): number {
    let score = message.role === 'assistant' ? 2 : 3;

    if (message.content.length > 120) {
      score += 1;
    }

    if (/\b(error|fix|plan|memory|deploy|build|database)\b/i.test(message.content)) {
      score += 1;
    }

    if (message.metadata?.success === false) {
      score += 1;
    }

    return Math.min(score, 5);
  }

  private buildMemoriesForConversation(conversation: Conversation): Memory[] {
    return conversation.messages
      .filter((message) => message.role !== 'system' && message.content.trim())
      .slice(-12)
      .map((message) => ({
        id: `mem-${conversation.id}-${message.id}`,
        conversationId: conversation.id,
        content: message.content.trim(),
        importance: this.scoreMemoryImportance(message),
        tags: this.buildMemoryTags(message),
        createdAt: message.timestamp
      }));
  }

  private replaceConversationMemories(conversation: Conversation) {
    this.db.prepare('DELETE FROM memories WHERE conversation_id = ?').run(conversation.id);

    const insertMemory = this.db.prepare(`
      INSERT INTO memories (id, conversation_id, content, importance, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const memory of this.buildMemoriesForConversation(conversation)) {
      insertMemory.run(
        memory.id,
        memory.conversationId,
        memory.content,
        memory.importance,
        JSON.stringify(memory.tags),
        memory.createdAt
      );
    }
  }

  private getMessageStorageId(conversationId: string, messageId: string, occurrence: number): string {
    const baseId = `${conversationId}:${messageId}`;
    return occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`;
  }

  saveConversation(conversation: Conversation): void {
    const saveConversationTransaction = this.db.transaction((value: Conversation) => {
      this.db.prepare(`
        INSERT INTO conversations (id, title, project_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          project_id = excluded.project_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        value.id,
        value.title,
        value.projectId ?? null,
        value.createdAt,
        value.updatedAt
      );

      this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(value.id);

      const insertMessage = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const messageIdCounts = new Map<string, number>();
      for (const message of value.messages) {
        const occurrence = messageIdCounts.get(message.id) ?? 0;
        messageIdCounts.set(message.id, occurrence + 1);
        insertMessage.run(
          this.getMessageStorageId(value.id, message.id, occurrence),
          value.id,
          message.role,
          message.content,
          message.timestamp,
          message.metadata ? JSON.stringify(message.metadata) : null
        );
      }

      this.replaceConversationMemories(value);
    });

    saveConversationTransaction(conversation);
  }

  getConversation(id: string): Conversation | null {
    const conversation = this.db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined;

    if (!conversation) {
      return null;
    }

    const messages = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC')
      .all(id) as MessageRow[];

    return this.mapConversation(conversation, messages);
  }

  getAllConversations(limit?: number): Conversation[] {
    const query = limit
      ? 'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?'
      : 'SELECT * FROM conversations ORDER BY updated_at DESC';
    const rows = (limit
      ? this.db.prepare(query).all(limit)
      : this.db.prepare(query).all()) as ConversationRow[];

    return rows
      .map((conversation) => this.getConversation(conversation.id))
      .filter((conversation): conversation is Conversation => conversation !== null);
  }

  getLatestConversation(projectId?: string): Conversation | null {
    const row = (projectId
      ? this.db.prepare(`
          SELECT * FROM conversations
          WHERE project_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `).get(projectId)
      : this.db.prepare(`
          SELECT * FROM conversations
          ORDER BY updated_at DESC
          LIMIT 1
        `).get()) as ConversationRow | undefined;

    if (!row) {
      return null;
    }

    return this.getConversation(row.id);
  }

  searchMemories(query: string, limit: number = 10): Memory[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories
      WHERE LOWER(content) LIKE LOWER(?)
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as MemoryRow[];

    return rows.map((row) => this.mapMemory(row));
  }

  getRecentMemories(limit: number = 20): Memory[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as MemoryRow[];

    return rows.map((row) => this.mapMemory(row));
  }

  saveProjectPlan(plan: ProjectPlan): void {
    const saveProjectPlanTransaction = this.db.transaction((value: ProjectPlan) => {
      this.db.prepare(`
        INSERT INTO project_plans (id, title, description, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        value.id,
        value.title,
        value.description,
        value.status,
        value.createdAt,
        value.updatedAt
      );

      this.db.prepare('DELETE FROM project_steps WHERE plan_id = ?').run(value.id);

      const insertStep = this.db.prepare(`
        INSERT INTO project_steps (id, plan_id, description, status, output, error, step_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      value.steps.forEach((step, index) => {
        insertStep.run(
          step.id,
          value.id,
          step.description,
          step.status,
          step.output ?? null,
          step.error ?? null,
          index
        );
      });
    });

    saveProjectPlanTransaction(plan);
  }

  getLatestProjectPlan(): ProjectPlan | null {
    const plan = this.db
      .prepare('SELECT * FROM project_plans ORDER BY updated_at DESC LIMIT 1')
      .get() as ProjectPlanRow | undefined;

    if (!plan) {
      return null;
    }

    const steps = this.db
      .prepare('SELECT * FROM project_steps WHERE plan_id = ? ORDER BY step_order ASC')
      .all(plan.id) as ProjectStepRow[];

    return this.mapProjectPlan(plan, steps);
  }

  getConversationCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }).count;
  }

  getMemoryCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count;
  }

  getProjectPlanCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM project_plans').get() as { count: number }).count;
  }

  private mapSession(session: SessionRow): Session {
    return {
      id: session.id,
      name: session.name,
      copilotSessionId: session.copilot_session_id,
      repoPath: session.repo_path,
      branch: session.branch ?? undefined,
      status: session.status,
      objective: session.objective ?? undefined,
      lastSummary: session.last_summary ?? undefined,
      focusLevel: session.focus_level,
      metadata: session.metadata ? JSON.parse(session.metadata) : undefined,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  saveSession(session: Session): void {
    this.db.prepare(`
      INSERT INTO sessions (id, name, copilot_session_id, repo_path, branch, status, objective, last_summary, focus_level, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        copilot_session_id = excluded.copilot_session_id,
        repo_path = excluded.repo_path,
        branch = excluded.branch,
        status = excluded.status,
        objective = excluded.objective,
        last_summary = excluded.last_summary,
        focus_level = excluded.focus_level,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `).run(
      session.id,
      session.name,
      session.copilotSessionId,
      session.repoPath,
      session.branch ?? null,
      session.status,
      session.objective ?? null,
      session.lastSummary ?? null,
      session.focusLevel,
      session.metadata ? JSON.stringify(session.metadata) : null,
      session.createdAt,
      session.updatedAt
    );
  }

  getSession(id: string): Session | null {
    const session = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined;

    if (!session) {
      return null;
    }

    return this.mapSession(session);
  }

  getAllSessions(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
      .all() as SessionRow[];

    return rows.map((session) => this.mapSession(session));
  }

  getCurrentSession(): Session | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC LIMIT 1')
      .get('active') as SessionRow | undefined;

    return row ? this.mapSession(row) : null;
  }

  getRestorableSessions(): Session[] {
    const rows = this.db.prepare(`
      SELECT * FROM sessions
      WHERE status != 'completed'
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'thinking' THEN 2
          ELSE 3
        END,
        updated_at DESC,
        created_at DESC
    `).all() as SessionRow[];

    return rows.map((session) => this.mapSession(session));
  }

  deleteSession(id: string): void {
    const deleteSession = this.db.transaction((sessionId: string) => {
      this.db.prepare('DELETE FROM session_context_share WHERE from_session_id = ? OR to_session_id = ?').run(sessionId, sessionId);
      this.db.prepare('DELETE FROM session_messages WHERE from_session_id = ? OR to_session_id = ?').run(sessionId, sessionId);
      this.db.prepare('DELETE FROM session_history WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM session_archive WHERE id = ?').run(sessionId);
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    });
    deleteSession(id);
  }

  closeSessionRecordOnly(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  updateSessionStatus(id: string, status: SessionStatus): void {
    this.db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(
      status,
      Date.now(),
      id
    );
  }

  updateSessionSummary(id: string, summary: string): void {
    this.db.prepare('UPDATE sessions SET last_summary = ?, updated_at = ? WHERE id = ?').run(
      summary,
      Date.now(),
      id
    );
  }

  clearActiveSessions(exceptId?: string): void {
    const now = Date.now();
    if (exceptId) {
      this.db.prepare(`
        UPDATE sessions
        SET status = 'idle', updated_at = ?
        WHERE status = 'active' AND id != ?
      `).run(now, exceptId);
      return;
    }

    this.db.prepare(`
      UPDATE sessions
      SET status = 'idle', updated_at = ?
      WHERE status = 'active'
    `).run(now);
  }

  saveSessionMessage(message: SessionMessage): number {
    const result = this.db.prepare(`
      INSERT INTO session_messages (from_session_id, to_session_id, message, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      message.fromSessionId,
      message.toSessionId,
      message.message,
      message.createdAt
    );

    return result.lastInsertRowid as number;
  }

  getSessionMessages(sessionId: string, limit: number = 50): SessionMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM session_messages
      WHERE from_session_id = ? OR to_session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, sessionId, limit) as SessionMessageRow[];

    return rows.map((row) => ({
      id: row.id,
      fromSessionId: row.from_session_id,
      toSessionId: row.to_session_id,
      message: row.message,
      createdAt: row.created_at
    }));
  }

  saveSessionContextShare(share: Omit<SessionContextShare, 'id'>): number {
    const result = this.db.prepare(`
      INSERT INTO session_context_share (from_session_id, to_session_id, context, context_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      share.fromSessionId,
      share.toSessionId,
      JSON.stringify(share.context),
      share.contextType,
      share.createdAt
    );

    return result.lastInsertRowid as number;
  }

  getSessionContextShares(sessionId: string, limit: number = 50): SessionContextShare[] {
    const rows = this.db.prepare(`
      SELECT * FROM session_context_share
      WHERE from_session_id = ? OR to_session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, sessionId, limit) as SessionContextShareRow[];

    return rows.map((row) => ({
      id: row.id,
      fromSessionId: row.from_session_id,
      toSessionId: row.to_session_id,
      context: JSON.parse(row.context) as Record<string, unknown>,
      contextType: row.context_type,
      createdAt: row.created_at
    }));
  }

  getSessionCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count;
  }

  getActiveSessionsCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE status IN (?, ?, ?)').get('idle', 'active', 'paused') as { count: number }).count;
  }

  getActiveAndPausedSessions(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE status IN (?, ?) ORDER BY updated_at DESC')
      .all('active', 'paused') as SessionRow[];
    return rows.map((session) => this.mapSession(session));
  }

  logSessionHistory(sessionId: string, action: string, details?: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT INTO session_history (session_id, action, details, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(
      sessionId,
      action,
      details ? JSON.stringify(details) : null,
      Date.now()
    );
  }

  getSessionHistory(sessionId: string, limit: number = 100): Array<{ id: number; action: string; details?: Record<string, unknown>; timestamp: number }> {
    const rows = this.db.prepare(`
      SELECT * FROM session_history
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionId, limit) as SessionHistoryRow[];

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      details: row.details ? JSON.parse(row.details) : undefined,
      timestamp: row.timestamp
    }));
  }

  archiveSession(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    const now = Date.now();
    this.db.prepare(`
      INSERT INTO session_archive (id, name, copilot_session_id, repo_path, objective, final_summary, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.name,
      session.copilotSessionId,
      session.repoPath,
      session.objective ?? null,
      session.lastSummary ?? null,
      session.createdAt,
      now
    );

    this.logSessionHistory(sessionId, 'archived', { archivedAt: now });
  }

  getArchivedSessions(limit: number = 50): Array<{
    id: string;
    name: string;
    copilotSessionId: string;
    repoPath: string;
    objective?: string;
    finalSummary?: string;
    createdAt: number;
    completedAt: number;
  }> {
    const rows = this.db.prepare(`
      SELECT * FROM session_archive
      ORDER BY completed_at DESC
      LIMIT ?
    `).all(limit) as SessionArchiveRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      copilotSessionId: row.copilot_session_id,
      repoPath: row.repo_path,
      objective: row.objective ?? undefined,
      finalSummary: row.final_summary ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at
    }));
  }

  restoreFromArchive(sessionId: string): void {
    const archived = this.db.prepare('SELECT * FROM session_archive WHERE id = ?').get(sessionId) as SessionArchiveRow | undefined;
    if (!archived) {
      return;
    }

    const session: Session = {
      id: archived.id,
      name: archived.name,
      copilotSessionId: archived.copilot_session_id,
      repoPath: archived.repo_path,
      branch: undefined,
      status: 'idle',
      objective: archived.objective ?? undefined,
      lastSummary: archived.final_summary ?? undefined,
      focusLevel: 0,
      createdAt: archived.created_at,
      updatedAt: Date.now()
    };

    this.saveSession(session);
    this.logSessionHistory(sessionId, 'restored', { restoredAt: Date.now() });
  }

  deleteArchivedSession(sessionId: string): void {
    this.db.prepare('DELETE FROM session_archive WHERE id = ?').run(sessionId);
  }

  clearOldSessions(daysOld: number): number {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    const completedSessionIds = this.db.prepare(`
      SELECT id FROM sessions
      WHERE status = 'completed' AND updated_at < ?
    `).all(cutoffTime) as Array<{ id: string }>;

    for (const { id } of completedSessionIds) {
      this.archiveSession(id);
      this.deleteSession(id);
    }

    return completedSessionIds.length;
  }

  close(): void {
    this.db.close();
  }
}

export default DatabaseService;
