import { API_URL } from '../utils/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
}

export interface SocialLinks {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'provider' | 'admin';
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: UserProfile;
  needsOnboarding?: boolean;
  onboardingToken?: string;
}

export interface ProviderListItem {
  id: string;
  userId?: string;
  businessName: string;
  location?: string;
  services: string[];
  avgRating: number;
  reviewCount: number;
  logoImageId?: string;
  isVerified?: boolean;
  status?: string;
  accountType?: string;
	// Campos de aplicação (retornados pelos endpoints admin).
  birthDate?: string;
  documentType?: string;
  documentFileName?: string;
  documentImageId?: string;
  socialLink?: string;
  legalRepresentativeName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  companyName?: string;
	// Campos de onboarding / preferências de serviço.
  bio?: string;
  acceptsDogs?: boolean;
  acceptsCats?: boolean;
  acceptsNeutered?: boolean;
  acceptsIntact?: boolean;
  whatsapp?: string;
  socialLinks?: SocialLinks;
  onboardingCompletedAt?: string;
}

export interface GalleryImage {
  id: string;
  imageId: string;
  sortOrder: number;
}

export interface ProviderDetail extends ProviderListItem {
  website?: string;
  workingHours?: Record<string, string>;
  galleryImages?: GalleryImage[];
}

export interface ProviderApplicationData {
  businessName: string;
  description: string;
  services: string[];
  location: string;
  phone?: string;
  website?: string;
}

// Espelha RegisterProviderRequest do backend. accountType é o toggle PF/PJ.
//
// PF requer: birthDate. fullName = nome pessoal.
// PJ requer: businessName (Razão Social) + taxId (CNPJ).
//   fullName no PJ = representante legal.
//
// documentFileName / socialLink são opcionais; documentImageId vem de
// uploadImage(file, 'document') chamado antes do registro.
export interface ProviderRegisterData {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  accountType: 'pessoa_fisica' | 'pessoa_juridica';
  birthDate?: string;
  businessName?: string;
  taxId?: string;
  service: string;
  documentType: string;
  documentFileName?: string;
  documentImageId?: string;
  socialLink?: string;
}

export interface Review {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ─── Download autenticado de documentos ────────────────────────────────────────

// downloadDocument busca uma imagem/documento da API com token de autenticação,
// cria uma URL blob e a retorna. Use para recursos restritos a admin como
// documentos de identidade de prestadores que requerem autenticação.
export async function downloadDocument(imageId: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const response = await fetch(`${API_URL}/api/images/${encodeURIComponent(imageId)}`, {
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Download failed (HTTP ${response.status})`;
    try {
      const err = await response.json();
      message = err.message || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// ─── Gerenciamento de token (em memória, refresh em cookie httpOnly) ───────────

let _accessToken: string | null = null;

export function getToken(): string | null {
  return _accessToken;
}

export function setToken(token: string): void {
  _accessToken = token;
}

export function clearToken(): void {
  _accessToken = null;
}

// ─── Upload de imagem (multipart, ignora JSON apiFetch) ────────────────────────

export async function uploadImage(file: File, type: string = 'pet', token?: string): Promise<{ imageId: string; url: string }> {
  const formData = new FormData();
  formData.append('image', file);

  const headers: Record<string, string> = {};
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  let url = `${API_URL}/api/images/upload?type=${encodeURIComponent(type)}`;
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Upload failed (HTTP ${response.status})`;
    try {
      const err = await response.json();
      message = err.message || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const result = await response.json();

// Purga qualquer entrada de cache SW obsoleta para este ID de imagem
	// para que a próxima requisição vá direto ao backend (que tem o novo arquivo).
  invalidateSWImageCache(result.imageId);

  return result;
}

// ─── Helpers de cache do Service Worker ────────────────────────────────────────

/** Diz ao SW para purgar entradas em cache para um ID de imagem específico. */
export function invalidateSWImageCache(imageId: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'INVALIDATE_IMAGE',
      imageId,
    });
  }
}

/** Diz ao SW para purgar todas as imagens não-padrão em cache (ex.: após atualização em massa). */
export function invalidateSWAllImageCache() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'INVALIDATE_ALL_IMAGES',
    });
  }
}

// ─── Wrapper principal de fetch ────────────────────────────────────────────────

let _refreshPromise: Promise<AuthResponse | null> | null = null;

async function refreshToken(): Promise<AuthResponse | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        _currentUser = null;
        _accessToken = null;
        return null;
      }
      const resp: AuthResponse = await response.json();
      applyAuthResponse(resp);
      return resp;
    } catch {
      _currentUser = null;
      _accessToken = null;
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

	// Usa no-cache para requisições GET para o navegador sempre revalidar com
	// o servidor antes de servir JSON em cache (evita listas de prestadores desatualizadas).
  const fetchOpts: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };
  if (!options.method || options.method === 'GET') {
    fetchOpts.cache = 'no-cache';
  }

  let response = await fetch(`${API_URL}${path}`, fetchOpts);

	// Em 401, tenta refresh do token e repete uma vez. Pula para o próprio
	// refresh e endpoints auth para evitar loops infinitos.
  if (response.status === 401 && !path.startsWith('/api/auth')) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!response.ok) {
    // Tenta parsear corpo de erro
    let apiErr: ApiError = { error: 'unknown_error', message: `HTTP ${response.status}` };
    try {
      apiErr = await response.json();
    } catch {
      // ignora falha de parse
    }
    throw new Error(apiErr.message || apiErr.error);
  }

  // 204 Sem Conteúdo
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Cache de sessão para o usuário logado. O refresh token vive em um cookie
// httpOnly mantido pelo backend; este é apenas o espelho em memória que o
// UI usa para renderizar estado de login sem refazer fetch a cada renderização.
let _currentUser: UserProfile | null = null;

export function getCurrentUser(): UserProfile | null {
  return _currentUser;
}

let _authInitDone = false;
let _authInitPromise: Promise<UserProfile | null> | null = null;

// authReady resolve quando a verificação inicial de sessão completa (sucesso ou
// falha). Componentes que precisam de token devem aguardar isso antes de disparar.
export function authReady(): Promise<UserProfile | null> {
  if (_currentUser) return Promise.resolve(_currentUser);
  if (_authInitDone) return Promise.resolve(null);
  if (!_authInitPromise) {
    _authInitPromise = refreshToken().then((resp) => {
      _authInitDone = true;
      return resp?.user ?? null;
    });
  }
  return _authInitPromise;
}

function applyAuthResponse(resp: AuthResponse): AuthResponse {
  setToken(resp.accessToken);
  _currentUser = resp.user;
  return resp;
}

export const auth = {
  signup: async (
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthResponse> => {
    const resp = await apiFetch<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
    return applyAuthResponse(resp);
  },

  signin: async (email: string, password: string): Promise<AuthResponse> => {
    const resp = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return applyAuthResponse(resp);
  },

  // Trades the httpOnly refresh cookie for a fresh access token. Used on app
  // boot to restore a session that survives a page reload.
  refresh: async (): Promise<AuthResponse | null> => {
    return refreshToken();
  },

  logout: async (): Promise<void> => {
    try {
      await apiFetch<void>('/api/auth/logout', { method: 'DELETE' });
    } finally {
      clearToken();
      _currentUser = null;
    }
  },

  // Always 200. `devResetLink` is only populated when the backend is in dev
  // mode (COOKIE_SECURE=false) — production hides the link entirely.
  requestPasswordReset: async (
    email: string,
  ): Promise<{ message: string; devResetLink?: string }> => {
    return apiFetch<{ message: string; devResetLink?: string }>(
      '/api/auth/password-reset/request',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
    );
  },

  confirmPasswordReset: async (token: string, password: string): Promise<void> => {
    await apiFetch<{ message: string }>('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
};

// ─── Admin ─────────────────────────────────────────────────────────────────────

export const admin = {
  listProviders: (
    params?: { status?: string; search?: string; page?: number; perPage?: number },
  ): Promise<SearchResult> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.perPage !== undefined) qs.set('per_page', String(params.perPage));
    const q = qs.toString();
    return apiFetch<SearchResult>(`/api/admin/providers${q ? `?${q}` : ''}`);
  },

  getPending: (): Promise<ProviderListItem[]> => {
    return apiFetch<ProviderListItem[]>('/api/admin/providers/pending');
  },

  approve: (id: string, reason: string): Promise<void> => {
    return apiFetch<void>(`/api/admin/providers/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  reject: (id: string, reason: string): Promise<void> => {
    return apiFetch<void>(`/api/admin/providers/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  suspend: (id: string, reason: string): Promise<void> => {
    return apiFetch<void>(`/api/admin/providers/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  unsuspend: (id: string, reason: string): Promise<void> => {
    return apiFetch<void>(`/api/admin/providers/${id}/unsuspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getAuditLog: (id: string): Promise<AdminAuditEntry[]> => {
    return apiFetch<AdminAuditEntry[]>(`/api/admin/providers/${id}/audit`);
  },

  exclude: (id: string): Promise<void> => {
    return apiFetch<void>(`/api/admin/providers/${id}`, { method: 'DELETE' });
  },

	  regenerateToken: (id: string): Promise<{ onboardingToken: string }> => {
	    return apiFetch<{ onboardingToken: string }>(`/api/admin/providers/${id}/regenerate-token`, { method: 'POST' });
	  },

  getStats: (): Promise<AdminStats> => {
    return apiFetch<AdminStats>('/api/admin/stats');
  },

  getProviderGrowth: (range: string): Promise<ProviderGrowthResponse> => {
    return apiFetch<ProviderGrowthResponse>(`/api/admin/stats/providers?range=${encodeURIComponent(range)}`);
  },
};

export interface AdminAuditEntry {
  id: string;
  providerId: string;
  adminId: string;
  adminEmail: string;
  action: string;
  previousStatus?: string;
  newStatus?: string;
  notes?: string;
  createdAt: string;
}

export interface SearchResult {
  providers: ProviderListItem[];
  total: number;
  page: number;
  perPage: number;
}

export interface AdminStats {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalProviders: number;
  providersByStatus: Record<string, number>;
  totalReviews: number;
  newUsersLast30Days: number;
  newProvidersLast30Days: number;
}

export interface ProviderGrowthPoint {
  date: string;
  total: number;
  byService: Record<string, number>;
}

export interface ProviderGrowthResponse {
  range: string;
  interval: string;
  data: ProviderGrowthPoint[];
}

// ─── Providers ────────────────────────────────────────────────────────────────

export const providers = {
  list: (filters?: {
    q?: string;
    service?: string;
    location?: string;
    limit?: number;
    offset?: number;
    acceptsDogs?: boolean | null;
    acceptsCats?: boolean | null;
    acceptsNeutered?: boolean | null;
    acceptsIntact?: boolean | null;
  }): Promise<SearchResult> => {
    const params = new URLSearchParams();
    if (filters?.q) params.set('q', filters.q);
    if (filters?.service) params.set('service', filters.service);
    if (filters?.location) params.set('location', filters.location);
    if (filters?.acceptsDogs != null) params.set('acceptsDogs', String(filters.acceptsDogs));
    if (filters?.acceptsCats != null) params.set('acceptsCats', String(filters.acceptsCats));
    if (filters?.acceptsNeutered != null) params.set('acceptsNeutered', String(filters.acceptsNeutered));
    if (filters?.acceptsIntact != null) params.set('acceptsIntact', String(filters.acceptsIntact));
    // Backend expects page/per_page, not limit/offset.
    const perPage = filters?.limit ?? 20;
    const page = filters?.offset !== undefined
      ? Math.floor(filters.offset / perPage) + 1
      : 1;
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    const qs = params.toString();
    return apiFetch<SearchResult>(`/api/providers${qs ? `?${qs}` : ''}`);
  },

  get: (id: string): Promise<ProviderDetail> => {
    return apiFetch<ProviderDetail>(`/api/providers/${id}`);
  },

  me: (): Promise<ProviderDetail> => {
    return apiFetch<ProviderDetail>('/api/providers/me');
  },

  apply: (data: ProviderApplicationData): Promise<{ id: string }> => {
    return apiFetch<{ id: string }>('/api/providers/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Public: creates user + pending provider in one call, returns auth tokens.
  register: async (data: ProviderRegisterData): Promise<AuthResponse> => {
    const resp = await apiFetch<AuthResponse>('/api/providers/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return applyAuthResponse(resp);
  },

  getReviews: (id: string): Promise<Review[]> => {
    return apiFetch<Review[]>(`/api/providers/${id}/reviews`);
  },

  // Update own provider profile. Rate-limited for businessName, logoImageId, and service flags.
  update: (data: {
    businessName: string;
    bio?: string;
    location?: string;
    logoImageId?: string;
    whatsapp?: string;
    acceptsDogs: boolean;
    acceptsCats: boolean;
    acceptsNeutered: boolean;
    acceptsIntact: boolean;
    socialLinks?: SocialLinks;
  }): Promise<ProviderDetail> => {
    return apiFetch<ProviderDetail>('/api/providers/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Gallery management.
  addGalleryImage: (imageId: string): Promise<{ galleryImages: GalleryImage[] }> => {
    return apiFetch<{ galleryImages: GalleryImage[] }>('/api/providers/me/gallery', {
      method: 'POST',
      body: JSON.stringify({ imageId }),
    });
  },

  removeGalleryImage: (imageId: string): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>(`/api/providers/me/gallery/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
    });
  },

  // Delete own provider account with password confirmation.
  deleteMe: (password: string): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>('/api/providers/me', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  },
};


// ─── Search Autocomplete ──────────────────────────────────────────────────────

export interface AutocompleteSuggestion {
  id: string;
  businessName: string;
  logoImageId?: string;
  services: string[];
  location?: string;
}

export const search = {
  autocomplete: (q: string): Promise<{ suggestions: AutocompleteSuggestion[] }> => {
    return apiFetch<{ suggestions: AutocompleteSuggestion[] }>(
      `/api/search/autocomplete?q=${encodeURIComponent(q)}`
    );
  },
};


// ─── Provider Onboarding ──────────────────────────────────────────────────────

export interface OnboardingValidation {
  provider: ProviderDetail;
  needsCredentials: boolean;
}

export interface OnboardingCompletePayload {
  avatarImageId?: string;
  businessName: string;
  galleryImageIds?: string[];
  acceptsDogs: boolean;
  acceptsCats: boolean;
  acceptsNeutered: boolean;
  acceptsIntact: boolean;
  description: string;
  location: string;
  whatsapp: string;
  email: string;
}

export const providerOnboarding = {
  validate: async (token: string): Promise<OnboardingValidation> => {
    return apiFetch<OnboardingValidation>('/api/providers/onboarding/validate', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  complete: async (token: string, data: OnboardingCompletePayload): Promise<void> => {
    return apiFetch<void>('/api/providers/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ token, data }),
    });
  },
};
