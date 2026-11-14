import { Router } from "express";
import {
  handleKeycloakLogin,
  handleForgotKCPassword,
  handleResetKCPassword,
  handleVerifyResetToken,
  handleUpdatePassword,
  handleRefreshToken,
  handleLogout,
  handleGetSession,
  handleGetUserInfo,
  handleGetUserSessions,
  handleRevokeUserSessions,
} from "../controllers/authController";

const router = Router();

/**
 * --------------------------------------------------------------------------
 * 1. Keycloak Login API
 * --------------------------------------------------------------------------
 * POST /api/auth/login
 */
router.post("/login", handleKeycloakLogin);

/**
 * --------------------------------------------------------------------------
 * 2. Keycloak Forgot Password APIs
 * --------------------------------------------------------------------------
 * POST /api/auth/forgot-password
 * POST /api/auth/forgot-kc-password
 * GET  /api/auth/verify-reset-token
 * POST /api/auth/verify-reset-token
 */
router.post("/forgot-password", handleForgotKCPassword);
router.post("/forgot-kc-password", handleForgotKCPassword);
router.get("/verify-reset-token", handleVerifyResetToken);
router.post("/verify-reset-token", handleVerifyResetToken);

/**
 * --------------------------------------------------------------------------
 * 3. Keycloak Reset & Update Password APIs
 * --------------------------------------------------------------------------
 * POST /api/auth/reset-password      (Token-based reset)
 * POST /api/auth/reset-kc-password   (Alias for reset-password)
 * POST /api/auth/update-password     (User change password / Admin update)
 * POST /api/auth/change-password     (Alias for update-password)
 */
router.post("/reset-password", handleResetKCPassword);
router.post("/reset-kc-password", handleResetKCPassword);
router.post("/update-password", handleUpdatePassword);
router.post("/change-password", handleUpdatePassword);

/**
 * --------------------------------------------------------------------------
 * 4. Login Session with Refresh Token Related APIs
 * --------------------------------------------------------------------------
 * POST /api/auth/refresh-token    (Exchange refresh token for new access/refresh tokens)
 * POST /api/auth/refresh          (Alias for refresh-token)
 * POST /api/auth/logout           (Revoke refresh token and invalidate user sessions)
 * GET  /api/auth/session          (Inspect current session, claims & user profile)
 * POST /api/auth/session          (Inspect session with body accessToken)
 * GET  /api/auth/me               (Alias for current user session)
 * GET  /api/auth/userinfo         (Direct OpenID Connect /userinfo endpoint)
 * GET  /api/auth/sessions         (List active Keycloak sessions for user)
 * POST /api/auth/sessions/revoke  (Revoke all active sessions for user)
 */
router.post("/refresh-token", handleRefreshToken);
router.post("/refresh", handleRefreshToken);
router.post("/logout", handleLogout);
router.get("/session", handleGetSession);
router.post("/session", handleGetSession);
router.get("/me", handleGetSession);
router.get("/userinfo", handleGetUserInfo);
router.get("/sessions", handleGetUserSessions);
router.post("/sessions/revoke", handleRevokeUserSessions);

export default router;
