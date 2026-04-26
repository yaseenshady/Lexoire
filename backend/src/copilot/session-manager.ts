import * as fs from 'fs';
import * as path from 'path';

interface Session {
  id: string;
  name: string;
  sessionId: string;
  createdAt: number;
  lastUsed: number;
  mdFolder: string;
}

const SESSIONS_DIR = path.resolve(process.cwd(), 'JARVIS_SESSIONS');
const SESSIONS_INDEX = path.join(SESSIONS_DIR, '.sessions.json');

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    this.ensureDir(SESSIONS_DIR);
    this.loadSessions();
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private loadSessions() {
    if (fs.existsSync(SESSIONS_INDEX)) {
      try {
        const data = JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));
        for (const s of data) {
          this.sessions.set(s.id, s);
        }
      } catch (e) {}
    }
  }

  private save() {
    fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(Array.from(this.sessions.values()), null, 2));
  }

  createSession(name: string, copilotSessionId: string): Session {
    const id = Math.random().toString(36).slice(2, 9);
    const mdFolder = path.join(SESSIONS_DIR, id);
    this.ensureDir(mdFolder);

    const session: Session = {
      id,
      name: name || `Session ${id}`,
      sessionId: copilotSessionId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      mdFolder,
    };

    fs.writeFileSync(path.join(mdFolder, 'README.md'), `# ${session.name}\n\nCreated: ${new Date().toISOString()}\n`);
    fs.writeFileSync(path.join(mdFolder, 'session.json'), JSON.stringify({ id, sessionId: copilotSessionId }, null, 2));

    this.sessions.set(id, session);
    this.save();
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  updateSessionUsage(id: string) {
    const s = this.sessions.get(id);
    if (s) {
      s.lastUsed = Date.now();
      this.save();
    }
  }

  deleteSession(id: string) {
    const s = this.sessions.get(id);
    if (s) {
      try { fs.rmSync(s.mdFolder, { recursive: true }); } catch (_) {}
      this.sessions.delete(id);
      this.save();
    }
  }

  getMdFolder(sessionId: string): string {
    const s = this.sessions.get(sessionId);
    return s?.mdFolder || SESSIONS_DIR;
  }
}

export const sessionManager = new SessionManager();
