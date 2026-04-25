import type { Request } from 'express';

export interface AcademicPptRuntimeStatus {
  baseUrl: string;
}

const DEFAULT_ACADEMIC_PPT_BASE_URL = 'http://127.0.0.1:5001';
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 5 * 1000;

class AcademicPptService {
  constructor(
    private readonly baseUrl: string = process.env.ACADEMIC_PPT_BASE_URL?.trim() || DEFAULT_ACADEMIC_PPT_BASE_URL
  ) {}

  getRuntimeStatus(): AcademicPptRuntimeStatus {
    return {
      baseUrl: this.baseUrl
    };
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(this.buildUrl('/health'), {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  forwardAnalyze(request: Request): Promise<Response> {
    return fetch(this.buildUrl('/analyze'), {
      method: 'POST',
      headers: this.pickHeaders(request, ['content-type', 'content-length']),
      body: request,
      duplex: 'half',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  }

  forwardGenerate(payload: unknown): Promise<Response> {
    return fetch(this.buildUrl('/generate'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  }

  download(sessionId: string): Promise<Response> {
    return fetch(this.buildUrl(`/download/${encodeURIComponent(sessionId)}`), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  }

  private buildUrl(pathname: string): string {
    const normalizedBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return new URL(pathname, normalizedBaseUrl).toString();
  }

  private pickHeaders(request: Request, headerNames: string[]): Record<string, string> {
    const selectedHeaders: Record<string, string> = {};

    for (const headerName of headerNames) {
      const value = request.headers[headerName];

      if (typeof value === 'string' && value.trim()) {
        selectedHeaders[headerName] = value;
        continue;
      }

      if (Array.isArray(value) && value.length > 0) {
        selectedHeaders[headerName] = value.join(', ');
      }
    }

    return selectedHeaders;
  }
}

export default AcademicPptService;
