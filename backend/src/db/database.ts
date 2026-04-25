import Database from 'better-sqlite3';
import type { Conversation, Memory, Message, ProjectPlan, ProjectStep, Session, SessionStatus, SessionMessage } from '../types';

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
  created_at: number;
  updated_at: number;
};

type SessionMessageRow = {
  id: number;
  from_session_id: string;
  to_session_id: string;
  message: string;
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_memories_conversation ON memories(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_steps_plan ON project_steps(plan_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_plans_updated_at ON project_plans(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_messages_from ON session_messages(from_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_messages_to ON session_messages(to_session_id);
    `);
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

      for (const message of value.messages) {
        insertMessage.run(
          message.id,
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
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  saveSession(session: Session): void {
    this.db.prepare(`
      INSERT INTO sessions (id, name, copilot_session_id, repo_path, branch, status, objective, last_summary, focus_level, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        copilot_session_id = excluded.copilot_session_id,
        repo_path = excluded.repo_path,
        branch = excluded.branch,
        status = excluded.status,
        objective = excluded.objective,
        last_summary = excluded.last_summary,
        focus_level = excluded.focus_level,
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

  deleteSession(id: string): void {
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

  getSessionCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count;
  }

  close(): void {
    this.db.close();
  }
}

export default DatabaseService;
