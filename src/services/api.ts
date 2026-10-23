import { AnalysisRecord, AuthUser, ContextType, LiveDetectionItem, SystemHealth } from '../types';

const TOKEN_KEY = 'voxsentra_jwt_token';
const USER_KEY = 'voxsentra_auth_user';

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setUser(user: AuthUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

function getHeaders(isFormData = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  const token = authStorage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Helper to ensure authenticated requests with silent re-auth fallback on expired tokens
async function authenticatedFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  let res = await fetch(input, init);

  if (res.status === 401) {
    // Attempt silent session renewal with backend
    try {
      const loginRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        authStorage.setToken(loginData.token);
        authStorage.setUser(loginData.user);

        // Retry original request with renewed bearer token
        const newHeaders = new Headers(init.headers || {});
        newHeaders.set('Authorization', `Bearer ${loginData.token}`);
        res = await fetch(input, { ...init, headers: newHeaders });
      }
    } catch (e) {
      console.warn('Session refresh attempt failed:', e);
    }
  }

  return res;
}

export const api = {
  async getHealth(): Promise<SystemHealth> {
    const res = await fetch('/health');
    if (!res.ok) {
      throw new Error(`Health check failed: HTTP ${res.status}`);
    }
    return res.json();
  },

  async login(identifier: string, password?: string): Promise<{ token: string; user: AuthUser }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error || 'Authentication failed');
    }
    const data = await res.json();
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    return data;
  },

  async verifySession(): Promise<{ valid: boolean; user: AuthUser } | null> {
    const token = authStorage.getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async analyzeFile(file: File, context: ContextType): Promise<AnalysisRecord> {
    const formData = new FormData();
    formData.append('audio', file, file.name);
    formData.append('context', context);

    const res = await authenticatedFetch('/api/v1/analyze', {
      method: 'POST',
      headers: getHeaders(true),
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
      throw new Error(err.error || `Analysis request failed with status ${res.status}`);
    }

    return res.json();
  },

  async analyzeBlob(blob: Blob, filename: string, context: ContextType): Promise<AnalysisRecord> {
    const formData = new FormData();
    formData.append('audio', blob, filename);
    formData.append('context', context);

    const res = await authenticatedFetch('/api/v1/analyze', {
      method: 'POST',
      headers: getHeaders(true),
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
      throw new Error(err.error || `Analysis request failed with status ${res.status}`);
    }

    return res.json();
  },

  async analyzeSample(sampleType: 'genuine' | 'spoof', context: ContextType): Promise<AnalysisRecord> {
    // Fetch the sample audio file and post as real audio
    const sampleUrl = sampleType === 'spoof' ? '/samples/spoof_sample.wav' : '/samples/genuine_sample.wav';
    const filename = sampleType === 'spoof' ? 'synthetic_voice_clone_sample.wav' : 'genuine_executive_call_sample.wav';

    let blob: Blob;
    try {
      const resp = await fetch(sampleUrl);
      if (resp.ok) {
        blob = await resp.blob();
      } else {
        throw new Error('Sample fetch failed');
      }
    } catch {
      // Fallback to sampleType trigger on server
      const res = await authenticatedFetch('/api/v1/analyze', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ sampleType, context, filename })
      });
      if (!res.ok) throw new Error('Analysis of sample failed');
      return res.json();
    }

    return api.analyzeBlob(blob, filename, context);
  },

  async analyzeChunk(chunkBase64: string, context: ContextType): Promise<LiveDetectionItem> {
    const res = await authenticatedFetch('/api/v1/analyze/chunk', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ audioChunkBase64: chunkBase64, context })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Chunk analysis failed' }));
      throw new Error(err.error || 'Live chunk analysis failed');
    }
    const data = await res.json();
    return {
      id: data.id || `live-${Date.now()}`,
      timestamp: data.timestamp || new Date().toISOString(),
      verdict: data.verdict,
      ai_probability: data.ai_probability,
      risk_score: data.risk_score,
      risk_level: data.risk_level,
      confidence: data.confidence,
      waveform_peak: data.waveform_peak,
      evidence: data.evidence,
      recommendation: data.recommendation
    };
  },

  async getHistory(params?: {
    search?: string;
    verdict?: string;
    risk?: string;
    sort?: string;
  }): Promise<{ total: number; records: AnalysisRecord[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.verdict) query.set('verdict', params.verdict);
    if (params?.risk) query.set('risk', params.risk);
    if (params?.sort) query.set('sort', params.sort);

    const url = `/api/v1/history${query.toString() ? '?' + query.toString() : ''}`;
    const res = await authenticatedFetch(url, {
      headers: getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to load history: HTTP ${res.status}`);
    }

    return res.json();
  },

  async getRecordById(id: string): Promise<AnalysisRecord> {
    const res = await authenticatedFetch(`/api/v1/history/${encodeURIComponent(id)}`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Record not found: HTTP ${res.status}`);
    }
    return res.json();
  }
};
