// Thin typed HTTP client for the private sync server. Knows nothing about
// chrome.storage or crypto — callers pass the base URL and token.

import type { DraftDTO, DraftUpsert, MatchQuery } from './types';

export type ApiErrorKind = 'network' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  get isOffline(): boolean {
    return this.kind === 'network';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token?: string | null;
}

interface RequestOptions {
  query?: Record<string, string | null | undefined>;
  body?: unknown;
  allowStatuses?: number[];
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string | null;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token ?? null;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(this.buildUrl(path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      throw new ApiError('network', `Network error: ${(err as Error).message}`);
    }

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError('parse', 'Invalid JSON response', res.status);
      }
    }

    if (!res.ok && !(opts.allowStatuses ?? []).includes(res.status)) {
      const errBody = body as { error?: string; message?: string } | null;
      throw new ApiError(
        'http',
        errBody?.message || `HTTP ${res.status}`,
        res.status,
        errBody?.error,
      );
    }

    return { status: res.status, body: body as T };
  }

  // -- Auth ------------------------------------------------------------------

  async createSyncKey(deviceName?: string): Promise<{
    syncKey: string;
    accessToken: string;
    deviceId: string;
    userId: string;
  }> {
    const { body } = await this.request<{
      syncKey: string;
      accessToken: string;
      deviceId: string;
      userId: string;
    }>('POST', '/api/auth/create-sync-key', { body: { deviceName } });
    return body;
  }

  async login(
    syncKey: string,
    deviceName?: string,
  ): Promise<{ accessToken: string; deviceId: string; userId: string }> {
    const { body } = await this.request<{
      accessToken: string;
      deviceId: string;
      userId: string;
    }>('POST', '/api/auth/login', { body: { syncKey, deviceName } });
    return body;
  }

  async logout(): Promise<void> {
    await this.request('POST', '/api/auth/logout', {});
  }

  // -- Drafts ----------------------------------------------------------------

  async listDrafts(since?: string): Promise<DraftDTO[]> {
    const { body } = await this.request<{ drafts: DraftDTO[] }>('GET', '/api/drafts', {
      query: { since },
    });
    return body.drafts;
  }

  async getDraft(id: string): Promise<DraftDTO> {
    const { body } = await this.request<{ draft: DraftDTO }>('GET', `/api/drafts/${encodeURIComponent(id)}`);
    return body.draft;
  }

  async matchDraft(q: MatchQuery): Promise<DraftDTO | null> {
    const { body } = await this.request<{ draft: DraftDTO | null }>('GET', '/api/drafts/match', {
      query: {
        type: q.type,
        localDraftKey: q.localDraftKey,
        topicId: q.topicId ?? undefined,
        postId: q.postId ?? undefined,
        categoryId: q.categoryId ?? undefined,
      },
    });
    return body.draft;
  }

  /** Upsert. On conflict returns `{ ok:false, code:'CONFLICT', serverDraft }`. */
  async upsertDraft(
    payload: DraftUpsert,
  ): Promise<
    | { ok: true; draft: DraftDTO }
    | { ok: false; code: 'CONFLICT'; serverDraft: DraftDTO }
  > {
    const { body } = await this.request<
      { ok: true; draft: DraftDTO } | { ok: false; code: 'CONFLICT'; serverDraft: DraftDTO }
    >('POST', '/api/drafts', { body: payload, allowStatuses: [409] });
    return body;
  }

  async deleteDraft(id: string, hard = false): Promise<void> {
    await this.request('DELETE', `/api/drafts/${encodeURIComponent(id)}`, {
      query: { hard: hard ? 'true' : undefined },
    });
  }

  async syncPending(items: DraftUpsert[]): Promise<
    Array<{
      localDraftKey: string;
      ok: boolean;
      code?: 'CONFLICT';
      draft?: DraftDTO;
      serverDraft?: DraftDTO;
    }>
  > {
    const { body } = await this.request<{
      results: Array<{
        localDraftKey: string;
        ok: boolean;
        code?: 'CONFLICT';
        draft?: DraftDTO;
        serverDraft?: DraftDTO;
      }>;
    }>('POST', '/api/sync/pending', { body: { items } });
    return body.results;
  }
}
