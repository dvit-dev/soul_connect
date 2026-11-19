import {API_URL} from '../config/env';

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

export async function request<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
      detail?: string;
    };
    if (!response.ok || data?.error) {
      return {
        ok: false,
        status: response.status,
        data,
        error:
          data?.error ||
          data?.message ||
          data?.detail ||
          `Request failed (${response.status})`,
      };
    }
    return {ok: true, status: response.status, data};
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: error?.message || 'Network error',
    };
  }
}

export async function uploadMediaFile(
  file: {uri: string; name: string; type: string},
  prefix: string,
): Promise<{ok: true; url: string} | {ok: false; error: string}> {
  const body = new FormData();
  body.append('prefix', prefix);
  body.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as any);
  try {
    const response = await fetch(`${API_URL}/media-upload?prefix=${encodeURIComponent(prefix)}`, {
      method: 'POST',
      headers: {'x-prefix': prefix},
      body,
    });
    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      url?: string;
      error?: string;
      message?: string;
    };
    if (!response.ok || !data.success || !data.url) {
      return {ok: false, error: data.error || data.message || `Upload failed (${response.status})`};
    }
    return {ok: true, url: data.url};
  } catch (error: any) {
    return {ok: false, error: error?.message || 'Network error while uploading file'};
  }
}

export async function savePublicCustomer(data: Record<string, unknown>) {
  return request('/api/public/customer_create', {
    method: 'POST',
    body: {
      ...data,
      whoiam_register: data.whoiam_register || data.profile_created_for || 'For myself',
      profile_created_for: data.profile_created_for || data.whoiam_register || 'For myself',
    },
  });
}

export async function sendOtp(payload: {
  email?: string;
  type: 'email' | 'phone';
  phone_number?: string;
  phone_code?: string;
}) {
  return request('/api/public/verification/send-otp', {method: 'POST', body: payload});
}

export async function verifyOtp(payload: {
  email?: string;
  type: 'email' | 'phone';
  otp: string;
  phone_number?: string;
}) {
  return request('/api/public/verification/verify-otp', {method: 'POST', body: payload});
}

export async function fetchSubscriptions(token?: string | null) {
  const path = token ? '/api/subscriptions' : '/api/public/subscriptions';
  const result = await request<any>(path, {token});
  const list = Array.isArray(result.data) ? result.data : result.data?.data || [];
  return {...result, list: Array.isArray(list) ? list : []};
}

export async function updateCustomerProfile(token: string, body: Record<string, unknown>) {
  return request('/api/customer_edit', {method: 'POST', token, body});
}

export async function fetchProfile(token: string, keycloakId?: string, email?: string) {
  return request('/api/profile_detail', {
    method: 'POST',
    token,
    body: {keycloakId, email},
  });
}

export async function fetchCustomerList(
  token: string,
  body: {
    customer_type: boolean;
    skip: number;
    limit: number;
    filters: Record<string, string>;
  },
) {
  return request<{data?: any[]; total?: number}>('/api/customer_list', {
    method: 'POST',
    token,
    body,
  });
}

export async function fetchCustomerDetail(token: string, id: string) {
  return request(`/api/customer_detail/${id}`, {token});
}

export async function fetchInterested(token: string, payload: Record<string, unknown>) {
  const authed = await request('/api/interested_list', {
    method: 'POST',
    token,
    body: payload,
  });
  if (authed.ok) {
    return authed;
  }
  return request('/api/public/interested_list', {method: 'POST', body: payload});
}

export async function sendInterest(token: string, payload: Record<string, unknown>) {
  const primary = await request('/api/send_interest', {
    method: 'POST',
    token,
    body: payload,
  });
  if (primary.ok) {
    return primary;
  }
  return request('/api/customer_edit', {
    method: 'POST',
    token,
    body: {
      id: payload.target_customer_id,
      customer_id: payload.target_customer_id,
      isInterested: payload.isInterested,
    },
  });
}

export async function fetchDashboard(token?: string | null) {
  const path = token ? '/api/dashboard_analytics' : '/api/public/dashboard_analytics';
  return request(path, {token});
}

export async function fetchTransactions(token: string, body: Record<string, unknown>) {
  return request('/api/transactions_list', {method: 'POST', token, body});
}

export async function fetchPaymentAccounts(token: string, body: Record<string, unknown>) {
  return request('/api/payment_account_list', {method: 'POST', token, body});
}

// ---------------------------------------------------------------------------
// Auth (Soul Connect backend /api/auth/*)
// ---------------------------------------------------------------------------

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

const NETWORK_ERROR = 'Network error. Check your connection and try again.';

/** Picks the backend's human-readable message, falling back to `fallback`. */
function messageOf(result: ApiResult<any>, fallback: string): string {
  if (result.status === 0) {
    return NETWORK_ERROR;
  }
  const msg = result.data?.message;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

/** POST /api/auth/login — email or username + password. */
export async function loginWithPassword(username: string, password: string): Promise<AuthTokens> {
  const result = await request<any>('/api/auth/login', {
    method: 'POST',
    body: {username, password, scope: 'openid profile email'},
  });
  const tokens = result.data?.data?.tokens as AuthTokens | undefined;
  if (!result.ok || result.data?.success === false || !tokens?.access_token) {
    throw new Error(messageOf(result, 'Sign-in failed. Please try again.'));
  }
  return tokens;
}

/** POST /api/auth/refresh-token — exchanges a refresh token for new tokens. */
export async function refreshAuthToken(refreshToken: string): Promise<AuthTokens> {
  const result = await request<any>('/api/auth/refresh-token', {
    method: 'POST',
    body: {refreshToken},
  });
  const tokens = (result.data?.tokens || result.data?.data?.tokens) as AuthTokens | undefined;
  if (!result.ok || result.data?.success === false || !tokens?.access_token) {
    throw new Error(messageOf(result, 'Session expired. Please sign in again.'));
  }
  return tokens;
}

/** POST /api/auth/logout — revokes this device's session on the server. */
export async function logoutSession(accessToken: string | null, refreshToken: string | null): Promise<boolean> {
  const result = await request<any>('/api/auth/logout', {
    method: 'POST',
    token: accessToken,
    body: refreshToken ? {refreshToken} : {},
  });
  return result.ok && result.data?.success !== false;
}

/** POST /api/auth/forgot-password — emails a reset link. */
export async function requestPasswordReset(email: string): Promise<{ok: boolean; message: string}> {
  const result = await request<any>('/api/auth/forgot-password', {
    method: 'POST',
    body: {email, sendNativeKeycloakEmail: false},
  });
  // Only `success` and `message` are read from this response, nothing else.
  const ok = result.ok && result.data?.success !== false;
  return {ok, message: messageOf(result, ok ? 'Reset link sent.' : 'Could not send the reset email.')};
}

/** POST /api/auth/verify-reset-token — checks a reset token before showing the form. */
export async function verifyResetToken(
  token: string,
): Promise<{valid: boolean; email?: string; message: string; network?: boolean}> {
  const result = await request<any>('/api/auth/verify-reset-token', {
    method: 'POST',
    body: {token},
  });
  if (result.status === 0) {
    return {valid: false, network: true, message: NETWORK_ERROR};
  }
  const valid = result.ok && result.data?.valid === true;
  return {
    valid,
    email: result.data?.email,
    message: messageOf(result, valid ? 'Reset token is valid.' : 'This reset link is invalid or has expired.'),
  };
}

/** POST /api/auth/reset-password — sets a new password using the emailed token. */
export async function resetPassword(token: string, newPassword: string): Promise<{ok: boolean; message: string}> {
  const result = await request<any>('/api/auth/reset-password', {
    method: 'POST',
    body: {token, newPassword},
  });
  const ok = result.ok && result.data?.success !== false;
  return {ok, message: messageOf(result, ok ? 'Password updated.' : 'Could not reset the password.')};
}

export function approvalStatus(item: any): string {
  if (item?.public_verify === true || item?.approvalStatus === 'Approved') {
    return 'Approved';
  }
  if (
    item?.approvalStatus === 'Rejected' ||
    String(item?.public_verify_command_helper || '').toLowerCase().includes('reject')
  ) {
    return 'Rejected';
  }
  return item?.approvalStatus || 'Wait for approval';
}

export function displayName(person: any): string {
  const name = `${person?.first_name || person?.firstName || ''} ${
    person?.last_name || person?.lastName || ''
  }`.trim();
  return name || person?.email || person?.name || 'Member';
}

export function photoUrl(person: any): string | null {
  const image = person?.image;
  if (Array.isArray(image) && image.length > 0) {
    const first = image[0];
    return typeof first === 'string' ? first : first?.url || null;
  }
  return null;
}

export function oppositeGender(gender?: string): string {
  const value = (gender || '').toLowerCase();
  if (value === '' || value === 'male' || value === 'maile') {
    return 'female';
  }
  return 'male';
}

export interface PlanCard {
  id: string;
  name: string;
  price: string;
  sub: string;
  features: string[];
  isPopular: boolean;
}

const STATIC_PLANS: PlanCard[] = [
  {
    id: 'free',
    name: 'Free Entry',
    price: '₹0',
    sub: 'Basic listing and search access',
    isPopular: false,
    features: [
      'Create profile (Tamil and English)',
      'Basic district filters',
      'Aadhaar verification request',
      'Receive match suggestions',
    ],
  },
  {
    id: 'premium',
    name: 'Premium Match',
    price: '₹2,499',
    sub: '3 months validity',
    isPopular: true,
    features: [
      'View direct contact details',
      'Unlimited candidate views',
      'Psychology compatibility index',
      'Highlight profile in searches',
    ],
  },
  {
    id: 'elite',
    name: 'Elite Circle',
    price: '₹4,999',
    sub: '6 months validity',
    isPopular: false,
    features: [
      'All Premium features',
      'Dedicated relationship manager',
      '1 free counselling session',
      'Featured badge',
    ],
  },
  {
    id: 'gold',
    name: 'Gold VIP',
    price: '₹9,999',
    sub: '12 months validity',
    isPopular: false,
    features: [
      'Dedicated relationship manager',
      'Family-to-family meetings',
      'Background verification audit',
      'Unlimited counselling reviews',
    ],
  },
];

export function mapPlans(subscriptions: any[]): PlanCard[] {
  const active = subscriptions
    .filter(sub => sub && sub.active !== false && sub.status !== 'inactive')
    .sort((a, b) => {
      const priceA = Number(String(a.price || 0).replace(/[^0-9.]/g, '')) || 0;
      const priceB = Number(String(b.price || 0).replace(/[^0-9.]/g, '')) || 0;
      return priceA - priceB;
    });
  if (active.length === 0) {
    return STATIC_PLANS;
  }
  return active.map((sub, index) => {
    const rawFeatures = sub.feature || sub.features || [];
    const features = Array.isArray(rawFeatures)
      ? rawFeatures.map((feature: any) =>
          typeof feature === 'object'
            ? feature.value || feature.name || feature.title || ''
            : String(feature),
        )
      : [];
    const formattedPrice =
      sub.price !== undefined && sub.price !== null
        ? `${sub.currency_type || '₹'}${
            typeof sub.price === 'number' ? sub.price.toLocaleString('en-IN') : sub.price
          }`
        : '₹0';
    return {
      id: String(sub._id || sub.id || sub.type || `plan-${index}`),
      name: sub.name || sub.type || 'Subscription Plan',
      price: formattedPrice,
      sub: sub.description || sub.sub || 'Membership plan',
      features: features.filter(Boolean).length
        ? features
        : STATIC_PLANS[index % STATIC_PLANS.length].features,
      isPopular: Boolean(sub.most_popluar || sub.most_popular || sub.isPopular),
    };
  });
}

export function isFreePrice(price: string): boolean {
  const amount = Number(String(price).replace(/[^0-9.]/g, ''));
  return !price || price === '₹0' || amount === 0;
}
