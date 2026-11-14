import { Request, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { getMasterAdminClient } from "../config/keycloak-admin";
import { sendGridEmail } from "../config/email";
import { Customers } from "../models/customer";
import { UserInfo } from "../models/userInfo";
import {
  decodeJwt,
  extractUserRoles,
  loginWithKeycloak,
  refreshKeycloakToken,
  logoutKeycloak,
  getKeycloakUserInfo,
  getKeycloakUserSessions,
  updateKeycloakUserPassword,
  verifyUserCredentials,
} from "../services/keycloakAuthService";

const TOKEN_SECRET = process.env.SESSION_SECRET || "soul-connect-secret-key-2026";

/**
 * Helper: Extract Bearer token from Request headers or query/body
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }
  if (req.body && typeof req.body.accessToken === "string") {
    return req.body.accessToken.trim();
  }
  if (req.body && typeof req.body.token === "string") {
    return req.body.token.trim();
  }
  if (req.query && typeof req.query.token === "string") {
    return req.query.token.trim();
  }
  return null;
}

/**
 * Helper: Generate secure signed token for password reset (valid for 30 minutes)
 */
export function generateResetToken(userId: string, email: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes expiration
  const payload = `${userId}:${email}:${expiresAt}`;
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return { token, expiresAt };
}

/**
 * Helper: Verify signed reset token
 */
export function verifyResetToken(token: string): { valid: boolean; userId?: string; email?: string; reason?: string } {
  if (!token) {
    return { valid: false, reason: "Missing reset token." };
  }

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 4) {
      return { valid: false, reason: "Invalid reset token format." };
    }

    const [userId, email, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);

    // Check expiration
    if (Date.now() > expiresAt) {
      return { valid: false, reason: "Reset link has expired. Please request a new password reset." };
    }

    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac("sha256", TOKEN_SECRET)
      .update(`${userId}:${email}:${expiresAtStr}`)
      .digest("hex");

    if (signature !== expectedSignature) {
      return { valid: false, reason: "Invalid or tampered reset token." };
    }

    return { valid: true, userId, email };
  } catch (err) {
    return { valid: false, reason: "Malformed reset token." };
  }
}

/**
 * ==========================================================================
 * ORIGINAL REVERTED FUNCTIONS (100% UNTOUCHED FOR ZERO IMPACT)
 * ==========================================================================
 */

/**
 * Handle Forgot Password request (ORIGINAL)
 */
export async function handleForgotPassword(req: Request, res: Response) {
  const { email } = req.body;

  // Negative Flow 1: Missing or empty email
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address.",
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Negative Flow 2: Email regex format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address format (e.g. name@example.com).",
    });
  }

  try {
    console.log(`🔍 [Forgot Password] Searching for user in Keycloak: ${cleanEmail}`);
    const kcAdminClient = await getMasterAdminClient();

    // Search user in Keycloak by email
    const users = await kcAdminClient.users.find({ email: cleanEmail, exact: true });

    // Negative Flow 3: User not found in Keycloak
    if (!users || users.length === 0) {
      console.warn(`⚠️ [Forgot Password] User not found in Keycloak: ${cleanEmail}`);
      return res.status(404).json({
        success: false,
        message: "No account found with this email address. Please check and try again.",
      });
    }

    const targetUser = users[0];

    // Negative Flow 4: Disabled user account
    if (targetUser.enabled === false) {
      console.warn(`⚠️ [Forgot Password] User account is disabled: ${cleanEmail}`);
      return res.status(403).json({
        success: false,
        message: "This account has been disabled. Please contact customer support.",
      });
    }

    console.log(`✅ [Forgot Password] User found (ID: ${targetUser.id}). Generating reset URL...`);

    // Generate secure signed reset token
    const { token } = generateResetToken(targetUser.id as string, cleanEmail);

    // Determine domain URL (frontend app)
    const domainUrl = process.env.FRONTEND_URL || "https://soulconect.com";
    const resetUrl = `${domainUrl}/reset_password?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    console.log(`🔗 Generated Reset URL: ${resetUrl}`);

    // Send email notification via SendGrid API
    let sendgridEmailSent = false;
    try {
      const userName = targetUser.firstName
        ? `${targetUser.firstName} ${targetUser.lastName || ""}`.trim()
        : targetUser.username || "Member";

      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #F2688C, #7C3AED); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
            <img src="https://api.soulconect.com/public/company_logo.png" alt="Soul Connect Logo" width="150" style="max-width:160px; height:auto; display:inline-block; margin-bottom:8px;" />
            <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Soul Connect</h2>
            <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">Password Reset Request</p>
          </div>

          <div style="padding: 28px 20px; color: #333333; line-height: 1.6;">
            <p style="font-size: 15px; font-weight: 600; margin-top: 0;">Hello ${userName},</p>
            <p style="font-size: 14px; color: #4b4468;">We received a request to reset your password for your Soul Connect account.</p>
            <p style="font-size: 14px; color: #4b4468;">Click the button below to set a new password. This link is valid for 30 minutes.</p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #F2688C, #7C3AED); color: #ffffff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);">
                Reset Password ✦
              </a>
            </div>

            <p style="font-size: 12px; color: #888888; border-top: 1px solid #eee; padding-top: 16px;">
              If you did not request a password reset, please ignore this email or contact support. Your password will remain unchanged.
            </p>
          </div>

          <div style="text-align: center; font-size: 11px; color: #aaaaaa; padding-top: 10px;">
            &copy; ${new Date().getFullYear()} Soul Connect. All rights reserved.
          </div>
        </div>
      `;

      await sendGridEmail({
        to: cleanEmail,
        subject: "Reset Your Password - Soul Connect",
        text: `Hello ${userName},\n\nWe received a request to reset your password for Soul Connect. Please visit ${resetUrl} to reset your password.`,
        html: htmlContent,
      });

      sendgridEmailSent = true;
      console.log(`✅ [Forgot Password] SendGrid Email API dispatched successfully to ${cleanEmail}`);
    } catch (sgErr: any) {
      console.error(`❌ [Forgot Password] SendGrid Email dispatch error:`, sgErr.message || sgErr);
    }

    return res.status(200).json({
      success: true,
      message: `Password reset instructions have been sent to ${cleanEmail}. Please check your inbox.`,
      email: cleanEmail,
      resetUrl,
    });

  } catch (error: any) {
    console.error("❌ [Forgot Password] Internal Exception:", error.message || error);
    const detailMsg = error.response?.data?.errorMessage || error.message || "Failed to process forgot password request";
    return res.status(500).json({
      success: false,
      message: "Unable to process password reset at this time. Please try again later.",
      details: detailMsg,
    });
  }
}

/**
 * Handle Reset Password request (ORIGINAL)
 */
export async function handleResetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;

  // Negative Flow 1: Missing token or password
  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      message: "Missing reset token.",
    });
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  }

  // Verify Token
  const tokenData = verifyResetToken(token);
  if (!tokenData.valid || !tokenData.userId) {
    return res.status(400).json({
      success: false,
      message: tokenData.reason || "Invalid or expired reset link. Please request a new password reset.",
    });
  }

  try {
    console.log(`🔒 [Reset Password] Resetting password for Keycloak User ID: ${tokenData.userId}`);
    const kcAdminClient = await getMasterAdminClient();

    // Reset user password in Keycloak
    await kcAdminClient.users.resetPassword({
      id: tokenData.userId,
      credential: {
        type: "password",
        value: newPassword,
        temporary: false,
      },
    });

    console.log(`✅ [Reset Password] Password updated successfully in Keycloak for User ID: ${tokenData.userId}`);

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully! You can now sign in with your new password.",
    });

  } catch (error: any) {
    console.error("❌ [Reset Password] Error resetting password in Keycloak:", error.message || error);
    const detailMsg = error.response?.data?.errorMessage || error.message || "Failed to reset password";
    return res.status(500).json({
      success: false,
      message: "Unable to update password. Please try requesting a new reset link.",
      details: detailMsg,
    });
  }
}

/**
 * ==========================================================================
 * NEW KEYCLOAK FORGOT & RESET PASSWORD APIS (handleForgotKCPassword & handleResetKCPassword)
 * ==========================================================================
 */

/**
 * Handle Keycloak Forgot Password request (NEW SEPARATE API)
 * Supports Keycloak user lookup, custom branded email, and native Keycloak action email.
 */
export async function handleForgotKCPassword(req: Request, res: Response) {
  const { email, sendNativeKeycloakEmail } = req.body;

  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address.",
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address format (e.g. name@example.com).",
    });
  }

  try {
    console.log(`🔍 [Forgot KC Password] Searching for user in Keycloak: ${cleanEmail}`);
    const kcAdminClient = await getMasterAdminClient();

    let users = await kcAdminClient.users.find({ email: cleanEmail, exact: true });

    if (!users || users.length === 0) {
      users = await kcAdminClient.users.find({ email: cleanEmail });
    }
    if (!users || users.length === 0) {
      users = await kcAdminClient.users.find({ username: cleanEmail });
    }

    if (!users || users.length === 0) {
      if (mongoose.connection.readyState === 1) {
        const customer = await Customers.findOne({
          email: { $regex: `^${cleanEmail}$`, $options: "i" },
        });
        if (customer && customer.keycloakId) {
          const found = await kcAdminClient.users.findOne({ id: customer.keycloakId });
          if (found) {
            users = [found];
          }
        }
      }
    }

    if (!users || users.length === 0) {
      console.warn(`⚠️ [Forgot KC Password] User not found in Keycloak: ${cleanEmail}`);
      return res.status(404).json({
        success: false,
        message: "No account found with this email address. Please check and try again.",
      });
    }

    const targetUser = users[0];

    if (targetUser.enabled === false) {
      console.warn(`⚠️ [Forgot KC Password] User account is disabled: ${cleanEmail}`);
      return res.status(403).json({
        success: false,
        message: "This account has been disabled. Please contact customer support.",
      });
    }

    console.log(`✅ [Forgot KC Password] User found (ID: ${targetUser.id}). Generating reset URL...`);

    const { token } = generateResetToken(targetUser.id as string, cleanEmail);
    const domainUrl = process.env.FRONTEND_URL || "https://soulconect.com";
    const resetUrl = `${domainUrl}/reset_password?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    console.log(`🔗 [Forgot KC Password] Generated Reset URL: ${resetUrl}`);

    if (sendNativeKeycloakEmail) {
      try {
        await kcAdminClient.users.executeActionsEmail({
          id: targetUser.id as string,
          actions: ["UPDATE_PASSWORD"],
          lifespan: 1800,
        });
        console.log(`✅ [Forgot KC Password] Triggered Keycloak native UPDATE_PASSWORD email`);
      } catch (kcEmailErr: any) {
        console.warn("Keycloak native action email warning:", kcEmailErr?.message || kcEmailErr);
      }
    }

    try {
      const userName = targetUser.firstName
        ? `${targetUser.firstName} ${targetUser.lastName || ""}`.trim()
        : targetUser.username || "Member";

      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #F2688C, #7C3AED); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
            <img src="https://api.soulconect.com/public/company_logo.png" alt="Soul Connect Logo" width="150" style="max-width:160px; height:auto; display:inline-block; margin-bottom:8px;" />
            <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Soul Connect</h2>
            <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">Password Reset Request</p>
          </div>

          <div style="padding: 28px 20px; color: #333333; line-height: 1.6;">
            <p style="font-size: 15px; font-weight: 600; margin-top: 0;">Hello ${userName},</p>
            <p style="font-size: 14px; color: #4b4468;">We received a request to reset your password for your Soul Connect account.</p>
            <p style="font-size: 14px; color: #4b4468;">Click the button below to set a new password. This link is valid for 30 minutes.</p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${resetUrl}" style="background: linear-gradient(135deg, #F2688C, #7C3AED); color: #ffffff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);">
                Reset Password ✦
              </a>
            </div>

            <p style="font-size: 12px; color: #888888; border-top: 1px solid #eee; padding-top: 16px;">
              If you did not request a password reset, please ignore this email or contact support. Your password will remain unchanged.
            </p>
          </div>

          <div style="text-align: center; font-size: 11px; color: #aaaaaa; padding-top: 10px;">
            &copy; ${new Date().getFullYear()} Soul Connect. All rights reserved.
          </div>
        </div>
      `;

      await sendGridEmail({
        to: cleanEmail,
        subject: "Reset Your Password - Soul Connect",
        text: `Hello ${userName},\n\nWe received a request to reset your password for Soul Connect. Please visit ${resetUrl} to reset your password.`,
        html: htmlContent,
      });

      console.log(`✅ [Forgot KC Password] SendGrid Email API dispatched successfully to ${cleanEmail}`);
    } catch (sgErr: any) {
      console.error(`❌ [Forgot KC Password] SendGrid Email dispatch error:`, sgErr.message || sgErr);
    }

    return res.status(200).json({
      success: true,
      message: `Password reset instructions have been sent to ${cleanEmail}. Please check your inbox.`,
      email: cleanEmail,
      resetUrl,
    });
  } catch (error: any) {
    console.error("❌ [Forgot KC Password] Internal Exception:", error.message || error);
    const detailMsg =
      error.response?.data?.errorMessage ||
      error.message ||
      "Failed to process forgot password request";
    return res.status(500).json({
      success: false,
      message: "Unable to process password reset at this time. Please try again later.",
      details: detailMsg,
    });
  }
}

/**
 * Handle Keycloak Reset Password request (NEW SEPARATE API)
 * Updates user password in Keycloak using a verified reset token.
 */
export async function handleResetKCPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      message: "Missing reset token.",
    });
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  }

  const tokenData = verifyResetToken(token);
  if (!tokenData.valid || !tokenData.userId) {
    return res.status(400).json({
      success: false,
      message:
        tokenData.reason || "Invalid or expired reset link. Please request a new password reset.",
    });
  }

  try {
    console.log(`🔒 [Reset KC Password] Resetting password for Keycloak User ID: ${tokenData.userId}`);
    await updateKeycloakUserPassword(tokenData.userId, newPassword, false);

    console.log(
      `✅ [Reset KC Password] Password updated successfully in Keycloak for User ID: ${tokenData.userId}`,
    );

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully! You can now sign in with your new password.",
    });
  } catch (error: any) {
    console.error("❌ [Reset KC Password] Error resetting password in Keycloak:", error.message || error);
    const detailMsg =
      error.response?.data?.errorMessage || error.message || "Failed to reset password";
    return res.status(500).json({
      success: false,
      message: "Unable to update password. Please try requesting a new reset link.",
      details: detailMsg,
    });
  }
}

/**
 * ==========================================================================
 * KEYCLOAK LOGIN, UPDATE PASSWORD & SESSION / REFRESH TOKEN APIS
 * ==========================================================================
 */

/**
 * 1. KEYCLOAK LOGIN API
 */
export async function handleKeycloakLogin(req: Request, res: Response) {
  const username = req.body.username || req.body.email || req.body.user;
  const password = req.body.password;
  const scope = req.body.scope;
  const clientId = req.body.clientId || req.body.client_id;
  const clientSecret = req.body.clientSecret || req.body.client_secret;

  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({
      success: false,
      message: "Username or email is required.",
    });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Password is required.",
    });
  }

  try {
    console.log(`🔐 [Keycloak Login] Attempting login for user: ${username.trim()}`);

    const result = await loginWithKeycloak({
      username: username.trim(),
      password,
      scope,
      clientId,
      clientSecret,
    });

    if (!result.success || !result.tokens) {
      return res.status(result.status || 401).json({
        success: false,
        error: result.error || "invalid_grant",
        message: result.error_description || "Invalid username/email or password.",
      });
    }

    const payload = result.payload;
    const keycloakId = payload?.sub;
    const email = payload?.email || (username.includes("@") ? username.trim().toLowerCase() : undefined);
    const { roles, primaryRole } = extractUserRoles(payload);

    let customerDoc: any = null;
    try {
      if (mongoose.connection.readyState === 1) {
        if (keycloakId) {
          customerDoc = await Customers.findOne({ keycloakId }).lean();
        }
        if (!customerDoc && email) {
          customerDoc = await Customers.findOne({
            email: { $regex: `^${email}$`, $options: "i" },
          }).lean();
        }
        if (!customerDoc && keycloakId) {
          customerDoc = await UserInfo.findOne({ keycloakId }).lean();
        }
      }
    } catch (dbErr: any) {
      console.warn("MongoDB customer lookup notice during login:", dbErr?.message || dbErr);
    }

    const userProfile = {
      keycloakId,
      username: payload?.preferred_username || username.trim(),
      email: payload?.email || email,
      firstName: payload?.given_name || customerDoc?.firstName || customerDoc?.first_name || "",
      lastName: payload?.family_name || customerDoc?.lastName || customerDoc?.last_name || "",
      name: payload?.name || customerDoc?.name || "",
      roles,
      primaryRole: customerDoc?.role || primaryRole,
      customerId: customerDoc?.customer_id || customerDoc?._id,
      customer: customerDoc || null,
    };

    console.log(
      `✅ [Keycloak Login] User authenticated successfully: ${userProfile.username} (ID: ${keycloakId})`,
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        tokens: result.tokens,
        user: userProfile,
      },
      tokens: result.tokens,
      user: userProfile,
    });
  } catch (error: any) {
    console.error("❌ [Keycloak Login] Internal Server Error:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "An internal error occurred during authentication. Please try again later.",
      details: error?.message || "Internal server error",
    });
  }
}

/**
 * 2. VERIFY RESET TOKEN API
 */
export async function handleVerifyResetToken(req: Request, res: Response) {
  const token = (req.body?.token || req.query?.token) as string;

  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      valid: false,
      message: "Reset token is required.",
    });
  }

  const tokenData = verifyResetToken(token);

  if (!tokenData.valid) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: tokenData.reason || "Invalid or expired reset token.",
    });
  }

  return res.status(200).json({
    success: true,
    valid: true,
    message: "Reset token is valid.",
    email: tokenData.email,
    userId: tokenData.userId,
  });
}

/**
 * 3. UPDATE PASSWORD API (User Change Password / Admin Update)
 */
export async function handleUpdatePassword(req: Request, res: Response) {
  const {
    currentPassword,
    oldPassword,
    newPassword,
    temporary,
    logoutOtherSessions,
  } = req.body;

  const effectiveCurrentPassword = currentPassword || oldPassword;

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "New password must be at least 6 characters long.",
    });
  }

  const bearer = extractBearerToken(req);
  let tokenClaims = bearer ? decodeJwt(bearer) : null;
  const kauthClaims = (req as any).kauth?.grant?.access_token?.content;
  if (!tokenClaims && kauthClaims) {
    tokenClaims = kauthClaims;
  }

  let targetUserId =
    req.body.keycloakId ||
    req.body.userId ||
    tokenClaims?.sub;

  let targetUsername =
    req.body.username ||
    req.body.email ||
    tokenClaims?.preferred_username ||
    tokenClaims?.email;

  const kcAdmin = await getMasterAdminClient();

  if (!targetUserId && targetUsername) {
    try {
      let users = await kcAdmin.users.find({ email: targetUsername, exact: true });
      if (!users || users.length === 0) {
        users = await kcAdmin.users.find({ username: targetUsername, exact: true });
      }
      if (users && users.length > 0) {
        targetUserId = users[0].id;
      }
    } catch (findErr: any) {
      console.warn("Keycloak user find notice:", findErr?.message || findErr);
    }
  }

  if (!targetUserId) {
    return res.status(400).json({
      success: false,
      message:
        "User identifier missing. Please provide a valid Bearer token, keycloakId, or email/username.",
    });
  }

  if (effectiveCurrentPassword && targetUsername) {
    const isOldPasswordValid = await verifyUserCredentials(
      targetUsername,
      effectiveCurrentPassword,
    );
    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect. Please verify and try again.",
      });
    }
  }

  try {
    console.log(`🔒 [Update Password] Updating password for Keycloak User ID: ${targetUserId}`);

    await updateKeycloakUserPassword(targetUserId, newPassword, Boolean(temporary));

    if (logoutOtherSessions) {
      try {
        await kcAdmin.users.logout({ id: targetUserId });
        console.log(`🚪 [Update Password] Invalidate user sessions for ID: ${targetUserId}`);
      } catch (logoutErr: any) {
        console.warn("Sessions revocation warning:", logoutErr?.message || logoutErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully! You can now sign in with your new password.",
    });
  } catch (error: any) {
    console.error("❌ [Update Password] Keycloak password update error:", error.message || error);
    const detailMsg =
      error.response?.data?.errorMessage || error.message || "Failed to update password";
    return res.status(500).json({
      success: false,
      message: "Failed to update password. Please try again later.",
      details: detailMsg,
    });
  }
}

/**
 * 4a. REFRESH TOKEN API
 */
export async function handleRefreshToken(req: Request, res: Response) {
  const refreshToken =
    req.body.refreshToken ||
    req.body.refresh_token ||
    req.query.refreshToken ||
    req.query.refresh_token;

  const clientId = req.body.clientId || req.body.client_id;
  const clientSecret = req.body.clientSecret || req.body.client_secret;
  const scope = req.body.scope;

  if (!refreshToken || typeof refreshToken !== "string" || !refreshToken.trim()) {
    return res.status(400).json({
      success: false,
      message: "Refresh token is required.",
    });
  }

  try {
    console.log("🔄 [Refresh Token] Exchanging refresh token with Keycloak...");

    const result = await refreshKeycloakToken({
      refreshToken: refreshToken.trim(),
      clientId,
      clientSecret,
      scope,
    });

    if (!result.success || !result.tokens) {
      return res.status(result.status || 401).json({
        success: false,
        error: result.error || "invalid_grant",
        message:
          result.error_description ||
          "Session expired or invalid refresh token. Please sign in again.",
      });
    }

    console.log("✅ [Refresh Token] Successfully refreshed tokens.");

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      tokens: result.tokens,
      data: {
        tokens: result.tokens,
      },
    });
  } catch (error: any) {
    console.error("❌ [Refresh Token] Error during token refresh:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh token. Please try again.",
      details: error.message,
    });
  }
}

/**
 * 4b. LOGOUT API
 */
export async function handleLogout(req: Request, res: Response) {
  const refreshToken =
    req.body.refreshToken ||
    req.body.refresh_token ||
    req.query.refreshToken;

  const allSessions = Boolean(req.body.allSessions || req.query.allSessions);
  const clientId = req.body.clientId || req.body.client_id;
  const clientSecret = req.body.clientSecret || req.body.client_secret;

  const bearer = extractBearerToken(req);
  const tokenClaims = bearer ? decodeJwt(bearer) : null;
  const keycloakId =
    req.body.keycloakId ||
    req.body.userId ||
    tokenClaims?.sub;

  try {
    console.log(`🚪 [Logout] Logging out user (Keycloak ID: ${keycloakId || "N/A"})...`);

    const result = await logoutKeycloak({
      refreshToken: typeof refreshToken === "string" ? refreshToken : undefined,
      keycloakId,
      clientId,
      clientSecret,
      allSessions,
    });

    if (req.session && typeof req.session.destroy === "function") {
      req.session.destroy((err: any) => {
        if (err) {
          console.warn("Express session destroy warning:", err);
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully. Login session has been invalidated.",
      details: result.details,
    });
  } catch (error: any) {
    console.error("❌ [Logout] Logout execution error:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to logout completely. Please clear local credentials.",
      details: error.message,
    });
  }
}

/**
 * 4c. SESSION STATUS / USER INFO API
 */
export async function handleGetSession(req: Request, res: Response) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      active: false,
      message: "No access token provided. Please include Authorization: Bearer <token>.",
    });
  }

  const payload = decodeJwt(token);

  if (!payload) {
    return res.status(401).json({
      success: false,
      active: false,
      message: "Malformed access token.",
    });
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowInSeconds) {
    return res.status(401).json({
      success: false,
      active: false,
      message: "Session token has expired. Please refresh your session.",
      expiredAt: payload.exp,
    });
  }

  const { roles, primaryRole } = extractUserRoles(payload);
  const keycloakId = payload.sub;
  const email = payload.email;

  let customerDoc: any = null;
  try {
    if (mongoose.connection.readyState === 1) {
      if (keycloakId) {
        customerDoc = await Customers.findOne({ keycloakId }).lean();
      }
      if (!customerDoc && email) {
        customerDoc = await Customers.findOne({
          email: { $regex: `^${email}$`, $options: "i" },
        }).lean();
      }
    }
  } catch (dbErr: any) {
    console.warn("Database lookup warning during session check:", dbErr?.message || dbErr);
  }

  const remainingSeconds = payload.exp ? Math.max(0, payload.exp - nowInSeconds) : null;

  return res.status(200).json({
    success: true,
    active: true,
    session: {
      expiresAt: payload.exp,
      expiresInSeconds: remainingSeconds,
      issuedAt: payload.iat,
      sessionState: payload.session_state,
    },
    user: {
      keycloakId,
      username: payload.preferred_username,
      email: payload.email,
      name: payload.name,
      firstName: payload.given_name || customerDoc?.firstName || customerDoc?.first_name,
      lastName: payload.family_name || customerDoc?.lastName || customerDoc?.last_name,
      roles,
      primaryRole: customerDoc?.role || primaryRole,
      customerId: customerDoc?.customer_id || customerDoc?._id,
    },
    customer: customerDoc || null,
  });
}

/**
 * 4d. GET KEYCLOAK USERINFO
 */
export async function handleGetUserInfo(req: Request, res: Response) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required in Authorization header.",
    });
  }

  const result = await getKeycloakUserInfo(token);

  if (!result.success) {
    return res.status(result.status).json({
      success: false,
      message: result.error || "Failed to fetch user info",
    });
  }

  return res.status(200).json({
    success: true,
    data: result.data,
  });
}

/**
 * 4e. GET USER SESSIONS API
 */
export async function handleGetUserSessions(req: Request, res: Response) {
  const bearer = extractBearerToken(req);
  const tokenClaims = bearer ? decodeJwt(bearer) : null;

  const keycloakId =
    (req.query.keycloakId as string) ||
    (req.body?.keycloakId as string) ||
    tokenClaims?.sub;

  if (!keycloakId) {
    return res.status(400).json({
      success: false,
      message: "keycloakId is required to list sessions.",
    });
  }

  try {
    const sessions = await getKeycloakUserSessions(keycloakId);
    return res.status(200).json({
      success: true,
      keycloakId,
      sessionCount: sessions.length,
      sessions,
    });
  } catch (error: any) {
    console.error("❌ [Get Sessions] Error fetching sessions:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user sessions.",
      details: error.message,
    });
  }
}

/**
 * 4f. REVOKE USER SESSIONS API
 */
export async function handleRevokeUserSessions(req: Request, res: Response) {
  const bearer = extractBearerToken(req);
  const tokenClaims = bearer ? decodeJwt(bearer) : null;

  const keycloakId =
    (req.body?.keycloakId as string) ||
    (req.query.keycloakId as string) ||
    tokenClaims?.sub;

  if (!keycloakId) {
    return res.status(400).json({
      success: false,
      message: "keycloakId is required to revoke sessions.",
    });
  }

  try {
    const kcAdmin = await getMasterAdminClient();
    await kcAdmin.users.logout({ id: keycloakId });

    return res.status(200).json({
      success: true,
      message: `All sessions revoked for Keycloak User ID: ${keycloakId}`,
    });
  } catch (error: any) {
    console.error("❌ [Revoke Sessions] Error revoking sessions:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke user sessions.",
      details: error.message,
    });
  }
}
