import { getMasterAdminClient } from "../config/keycloak-admin";

export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token: string;
  token_type: string;
  id_token?: string;
  "not-before-policy"?: number;
  session_state?: string;
  scope?: string;
  [key: string]: any;
}

export interface DecodedJwtPayload {
  sub?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  exp?: number;
  iat?: number;
  session_state?: string;
  [key: string]: any;
}

/**
 * Return resolved Keycloak configuration parameters from environment
 */
export function getKeycloakConfig() {
  const baseUrl = (process.env.KEYCLOAK_URL || "https://auth.soulconect.com").replace(/\/+$/, "");
  const realm = process.env.KEYCLOAK_REALM || "soul_connect";
  const clientId = process.env.KEYCLOAK_CLIENT_ID || "soul_connect_backend";
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || "";

  return { baseUrl, realm, clientId, clientSecret };
}

/**
 * Return standard Keycloak OpenID Connect endpoint URLs
 */
export function getKeycloakEndpoints() {
  const { baseUrl, realm } = getKeycloakConfig();
  const oidcBase = `${baseUrl}/realms/${realm}/protocol/openid-connect`;

  return {
    tokenUrl: `${oidcBase}/token`,
    userInfoUrl: `${oidcBase}/userinfo`,
    logoutUrl: `${oidcBase}/logout`,
    introspectUrl: `${oidcBase}/token/introspect`,
    authUrl: `${oidcBase}/auth`,
    certsUrl: `${oidcBase}/certs`,
  };
}

/**
 * Safely decodes a JWT token without verifying cryptographic signature
 * (useful for reading payload claims such as sub, email, roles, exp)
 */
export function decodeJwt(token: string): DecodedJwtPayload | null {
  if (!token || typeof token !== "string") return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonString = Buffer.from(payloadBase64, "base64").toString("utf8");
    return JSON.parse(jsonString);
  } catch (err) {
    return null;
  }
}

/**
 * Extracts all realm and client roles from a decoded token payload
 * and identifies the primary application role.
 */
export function extractUserRoles(payload?: DecodedJwtPayload | null): {
  roles: string[];
  primaryRole: string;
} {
  if (!payload) {
    return { roles: [], primaryRole: "user" };
  }

  const rolesSet = new Set<string>();

  // Realm roles
  if (Array.isArray(payload.realm_access?.roles)) {
    payload.realm_access.roles.forEach((r) => rolesSet.add(r));
  }

  // Client roles
  if (payload.resource_access && typeof payload.resource_access === "object") {
    Object.values(payload.resource_access).forEach((res: any) => {
      if (Array.isArray(res?.roles)) {
        res.roles.forEach((r: string) => rolesSet.add(r));
      }
    });
  }

  // Direct roles array if present
  if (Array.isArray(payload.roles)) {
    payload.roles.forEach((r: string) => rolesSet.add(r));
  }

  const allRoles = Array.from(rolesSet);

  // System roles to exclude when picking primary application role
  const systemRoles = new Set([
    "offline_access",
    "uma_authorization",
    "account-console",
    "view-profile",
    "manage-account",
    "manage-account-links",
  ]);

  const appRoles = allRoles.filter(
    (r) => !systemRoles.has(r) && !r.startsWith("default-roles"),
  );

  let primaryRole = "user";
  if (appRoles.some((r) => r.toLowerCase().includes("admin"))) {
    primaryRole = "admin";
  } else if (appRoles.some((r) => r.toLowerCase().includes("manager"))) {
    primaryRole = "manager";
  } else if (appRoles.some((r) => r.toLowerCase().includes("staff"))) {
    primaryRole = "staff";
  } else if (appRoles.some((r) => r.toLowerCase().includes("customer"))) {
    primaryRole = "customer";
  } else if (appRoles.length > 0) {
    primaryRole = appRoles[0];
  }

  return { roles: allRoles, primaryRole };
}

/**
 * Direct Keycloak Login with Password Grant
 */
export async function loginWithKeycloak(params: {
  username: string;
  password: string;
  scope?: string;
  clientId?: string;
  clientSecret?: string;
}): Promise<{
  success: boolean;
  status: number;
  tokens?: KeycloakTokenResponse;
  payload?: DecodedJwtPayload | null;
  error?: string;
  error_description?: string;
}> {
  const config = getKeycloakConfig();
  const endpoints = getKeycloakEndpoints();

  const clientId = params.clientId || config.clientId;
  // If clientSecret is explicitly passed, use it; otherwise use config secret if using configured clientId
  const clientSecret =
    params.clientSecret !== undefined
      ? params.clientSecret
      : clientId === config.clientId
      ? config.clientSecret
      : "";

  const scope = params.scope || "openid profile email offline_access";

  const buildBody = (u: string) => {
    const form = new URLSearchParams();
    form.append("grant_type", "password");
    form.append("client_id", clientId);
    if (clientSecret) {
      form.append("client_secret", clientSecret);
    }
    form.append("username", u.trim());
    form.append("password", params.password);
    form.append("scope", scope);
    return form;
  };

  try {
    let response = await fetch(endpoints.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildBody(params.username).toString(),
    });

    let data = (await response.json().catch(() => ({}))) as any;

    // Smart fallback: If username was given as email or vice-versa and direct grant failed,
    // attempt resolution via Keycloak Admin Client
    if (!response.ok && data?.error === "invalid_grant") {
      try {
        const kcAdmin = await getMasterAdminClient();
        const searchVal = params.username.trim();
        let kcUsers: any[] = [];

        if (searchVal.includes("@")) {
          kcUsers = await kcAdmin.users.find({ email: searchVal.toLowerCase(), exact: true });
        } else {
          kcUsers = await kcAdmin.users.find({ username: searchVal, exact: true });
        }

        if (kcUsers && kcUsers.length > 0) {
          const alternateUsername = kcUsers[0].username || kcUsers[0].email;
          if (alternateUsername && alternateUsername !== searchVal) {
            const retryResp = await fetch(endpoints.tokenUrl, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: buildBody(alternateUsername).toString(),
            });
            if (retryResp.ok) {
              response = retryResp;
              data = await retryResp.json();
            }
          }
        }
      } catch (adminLookupErr: any) {
        // Log silently and continue with initial response
        console.warn("Keycloak admin lookup fallback notice:", adminLookupErr?.message || adminLookupErr);
      }
    }

    if (!response.ok) {
      const error = data?.error || "login_failed";
      let error_description =
        data?.error_description ||
        data?.errorMessage ||
        data?.message ||
        "Authentication failed";

      if (error === "invalid_grant") {
        if (/disabled/i.test(error_description)) {
          error_description = "Your account has been disabled. Please contact support.";
        } else if (/not fully set up|action/i.test(error_description)) {
          error_description = "Account requires setup or verification. Please check your email.";
        } else {
          error_description = "Invalid username/email or password. Please try again.";
        }
      }

      return {
        success: false,
        status: response.status,
        error,
        error_description,
      };
    }

    const payload = decodeJwt(data.access_token);

    return {
      success: true,
      status: response.status,
      tokens: data as KeycloakTokenResponse,
      payload,
    };
  } catch (err: any) {
    console.error("Keycloak Login Error:", err);
    return {
      success: false,
      status: 502,
      error: "service_unavailable",
      error_description:
        err?.message || "Could not connect to authentication service.",
    };
  }
}

/**
 * Exchange a Refresh Token for a new Access Token & Refresh Token
 */
export async function refreshKeycloakToken(params: {
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}): Promise<{
  success: boolean;
  status: number;
  tokens?: KeycloakTokenResponse;
  payload?: DecodedJwtPayload | null;
  error?: string;
  error_description?: string;
}> {
  const config = getKeycloakConfig();
  const endpoints = getKeycloakEndpoints();

  const clientId = params.clientId || config.clientId;
  const clientSecret =
    params.clientSecret !== undefined
      ? params.clientSecret
      : clientId === config.clientId
      ? config.clientSecret
      : "";

  const form = new URLSearchParams();
  form.append("grant_type", "refresh_token");
  form.append("client_id", clientId);
  if (clientSecret) {
    form.append("client_secret", clientSecret);
  }
  form.append("refresh_token", params.refreshToken.trim());
  if (params.scope) {
    form.append("scope", params.scope);
  }

  try {
    const response = await fetch(endpoints.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const data = (await response.json().catch(() => ({}))) as any;

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data?.error || "token_refresh_failed",
        error_description:
          data?.error_description ||
          "Session expired or invalid refresh token. Please sign in again.",
      };
    }

    const payload = decodeJwt(data.access_token);

    return {
      success: true,
      status: response.status,
      tokens: data as KeycloakTokenResponse,
      payload,
    };
  } catch (err: any) {
    console.error("Keycloak Refresh Token Error:", err);
    return {
      success: false,
      status: 502,
      error: "service_unavailable",
      error_description:
        err?.message || "Could not connect to authentication service for token refresh.",
    };
  }
}

/**
 * Logout and invalidate session in Keycloak
 */
export async function logoutKeycloak(params: {
  refreshToken?: string;
  keycloakId?: string;
  clientId?: string;
  clientSecret?: string;
  allSessions?: boolean;
}): Promise<{ success: boolean; message: string; details?: any }> {
  const config = getKeycloakConfig();
  const endpoints = getKeycloakEndpoints();

  const clientId = params.clientId || config.clientId;
  const clientSecret =
    params.clientSecret !== undefined
      ? params.clientSecret
      : clientId === config.clientId
      ? config.clientSecret
      : "";

  let oidcRevoked = false;
  let adminSessionsRevoked = false;

  // 1. OIDC Token Logout via Refresh Token
  if (params.refreshToken) {
    try {
      const form = new URLSearchParams();
      form.append("client_id", clientId);
      if (clientSecret) {
        form.append("client_secret", clientSecret);
      }
      form.append("refresh_token", params.refreshToken.trim());

      const response = await fetch(endpoints.logoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      if (response.ok || response.status === 204) {
        oidcRevoked = true;
      }
    } catch (oidcErr: any) {
      console.warn("Keycloak OIDC logout notice:", oidcErr?.message || oidcErr);
    }
  }

  // 2. Admin API Logout (Invalidates all active sessions for this user)
  if (params.keycloakId && (params.allSessions || !params.refreshToken)) {
    try {
      const kcAdmin = await getMasterAdminClient();
      await kcAdmin.users.logout({ id: params.keycloakId });
      adminSessionsRevoked = true;
    } catch (adminErr: any) {
      console.warn("Keycloak Admin user logout notice:", adminErr?.message || adminErr);
    }
  }

  return {
    success: true,
    message: "Logged out successfully. Login session has been invalidated.",
    details: { oidcRevoked, adminSessionsRevoked },
  };
}

/**
 * Fetch Keycloak UserInfo via Bearer Access Token
 */
export async function getKeycloakUserInfo(
  accessToken: string,
): Promise<{ success: boolean; data?: any; error?: string; status: number }> {
  const endpoints = getKeycloakEndpoints();

  try {
    const response = await fetch(endpoints.userInfoUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data?.error_description || data?.error || "Invalid access token",
      };
    }

    return {
      success: true,
      status: response.status,
      data,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 502,
      error: err?.message || "Failed to reach UserInfo endpoint",
    };
  }
}

/**
 * Fetch active sessions for a user using Keycloak Admin Client
 */
export async function getKeycloakUserSessions(userId: string) {
  const kcAdmin = await getMasterAdminClient();
  const sessions = await kcAdmin.users.listSessions({ id: userId });
  return sessions;
}

/**
 * Update a user's password in Keycloak via Keycloak Admin Client
 */
export async function updateKeycloakUserPassword(
  userId: string,
  newPassword: string,
  temporary: boolean = false,
) {
  const kcAdmin = await getMasterAdminClient();
  await kcAdmin.users.resetPassword({
    id: userId,
    credential: {
      type: "password",
      value: newPassword,
      temporary,
    },
  });
  return true;
}

/**
 * Verify user's current credentials against Keycloak token endpoint
 */
export async function verifyUserCredentials(
  usernameOrEmail: string,
  password: string,
): Promise<boolean> {
  const result = await loginWithKeycloak({
    username: usernameOrEmail,
    password,
  });
  return result.success;
}
