import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {AppState} from 'react-native';
import {fetchProfile, logoutSession, refreshAuthToken} from '../services/api';
import {decodeJwt, isStaffRole, primaryRole, rolesFromToken, tokenExpired} from '../services/pkce';
import {clearSession, storageGet, storageKeys, storageSet} from '../services/storage';
import {UserProfile} from '../types/profile';

interface AuthContextValue {
  ready: boolean;
  authenticated: boolean;
  token: string | null;
  roles: string[];
  role: string;
  isStaff: boolean;
  profile: UserProfile | null;
  loadingProfile: boolean;
  profileError: string | null;
  signIn: (tokens: {accessToken: string; refreshToken: string; idToken?: string}) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const applyToken = useCallback(async (accessToken: string, refreshToken: string, idToken?: string) => {
    const nextRoles = rolesFromToken(accessToken);
    await storageSet(storageKeys.accessToken, accessToken);
    await storageSet(storageKeys.refreshToken, refreshToken);
    if (idToken) {
      await storageSet(storageKeys.idToken, idToken);
    }
    await storageSet(storageKeys.roles, primaryRole(nextRoles));
    await storageSet(storageKeys.loggedIn, 'true');
    setToken(accessToken);
    setRoles(nextRoles);
  }, []);

  const loadProfile = useCallback(async (accessToken: string) => {
    setLoadingProfile(true);
    setProfileError(null);
    try {
      const claims = decodeJwt(accessToken);
      const result = await fetchProfile(accessToken, claims?.sub, claims?.email);
      if (!result.ok) {
        throw new Error(result.error || 'Failed to load profile');
      }
      const data = (result.data?.data || result.data) as UserProfile;
      setProfile(data);
      if (data?.role) {
        setRoles(current => Array.from(new Set([...current, String(data.role)])));
      }
    } catch (error: any) {
      setProfileError(error?.message || 'Failed to load profile');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const signIn = useCallback(
    async (tokens: {accessToken: string; refreshToken: string; idToken?: string}) => {
      await applyToken(tokens.accessToken, tokens.refreshToken, tokens.idToken);
      await loadProfile(tokens.accessToken);
    },
    [applyToken, loadProfile],
  );

  const signOut = useCallback(async () => {
    // Revoke the session on the server first (best effort — never blocks logout).
    try {
      const [access, refresh] = await Promise.all([
        storageGet(storageKeys.accessToken),
        storageGet(storageKeys.refreshToken),
      ]);
      if (access || refresh) {
        await logoutSession(access, refresh);
      }
    } catch {
      // Offline or server error: still log out locally.
    }
    setToken(null);
    setRoles([]);
    setProfile(null);
    setProfileError(null);
    await clearSession();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (token) {
      await loadProfile(token);
    }
  }, [loadProfile, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let access = await storageGet(storageKeys.accessToken);
        const refresh = await storageGet(storageKeys.refreshToken);
        if (access && tokenExpired(access) && refresh) {
          const next = await refreshAuthToken(refresh);
          if (cancelled) {
            return;
          }
          await applyToken(next.access_token, next.refresh_token || refresh, next.id_token);
          access = next.access_token;
        } else if (access && !cancelled) {
          setToken(access);
          setRoles(rolesFromToken(access));
        }
        if (access && !cancelled) {
          await loadProfile(access);
        }
      } catch {
        await clearSession();
        if (!cancelled) {
          setToken(null);
          setRoles([]);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyToken, loadProfile]);

  // Keep the access token fresh: refresh shortly before it expires, and again
  // whenever the app returns to the foreground (timers don't run in background).
  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    const refreshNow = async () => {
      const refresh = await storageGet(storageKeys.refreshToken);
      if (!refresh || cancelled) {
        return;
      }
      try {
        const next = await refreshAuthToken(refresh);
        if (!cancelled) {
          await applyToken(next.access_token, next.refresh_token || refresh, next.id_token);
        }
      } catch (error: any) {
        // Refresh token rejected → session is over. Network errors: keep the session and retry later.
        if (!cancelled && !/network/i.test(String(error?.message))) {
          await clearSession();
          setToken(null);
          setRoles([]);
          setProfile(null);
        }
      }
    };
    const exp = Number(decodeJwt(token)?.exp || 0) * 1000;
    const delay = exp ? Math.max(exp - Date.now() - 60_000, 5_000) : 0;
    const timer = delay ? setTimeout(refreshNow, delay) : undefined;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && tokenExpired(token, 60)) {
        refreshNow();
      }
    });
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      sub.remove();
    };
  }, [token, applyToken]);

  const role = primaryRole(
    roles.length ? roles : profile?.role ? [String(profile.role)] : [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      authenticated: Boolean(token),
      token,
      roles,
      role,
      isStaff: isStaffRole(role) || isStaffRole(String(profile?.role || '')),
      profile,
      loadingProfile,
      profileError,
      signIn,
      signOut,
      refreshProfile,
    }),
    [ready, token, roles, role, profile, loadingProfile, profileError, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
