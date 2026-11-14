const assert = require("assert");

// Load .env first
require("dotenv").config();

// 1. Test generateResetToken & verifyResetToken
console.log("▶️  [Test 1] Testing Reset Token Generation & Verification...");
const {
  generateResetToken,
  verifyResetToken,
  handleForgotPassword,
  handleResetPassword,
  handleForgotKCPassword,
  handleResetKCPassword,
  handleKeycloakLogin,
  handleRefreshToken,
  handleUpdatePassword,
  handleGetSession,
  handleVerifyResetToken,
} = require("./dist/controllers/authController");

const mockUserId = "kc-user-uuid-12345";
const mockEmail = "testuser@soulconect.com";

const { token, expiresAt } = generateResetToken(mockUserId, mockEmail);
assert(token && typeof token === "string", "Token must be a non-empty string");
assert(expiresAt > Date.now(), "Token expiration must be in future");

const verified = verifyResetToken(token);
assert.strictEqual(verified.valid, true, "Generated token should be valid");
assert.strictEqual(verified.userId, mockUserId, "Extracted userId should match");
assert.strictEqual(verified.email, mockEmail, "Extracted email should match");

// Test tampered token
const tamperedToken = token.slice(0, -4) + "XXXX";
const tamperedResult = verifyResetToken(tamperedToken);
assert.strictEqual(tamperedResult.valid, false, "Tampered token should fail validation");

console.log("   ✅ Reset Token Generation & Verification PASSED");

// 2. Test JWT Decoding & Role Extraction
console.log("▶️  [Test 2] Testing JWT Decoding and Role Extraction...");
const { decodeJwt, extractUserRoles } = require("./dist/services/keycloakAuthService");

const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const mockPayload = {
  sub: "11223344-5566-7788-9900-aabbccddeeff",
  preferred_username: "raj_kumar",
  email: "raj.kumar@example.com",
  realm_access: {
    roles: ["offline_access", "uma_authorization", "customer"],
  },
  resource_access: {
    soul_connect_backend: {
      roles: ["manage-profile"],
    },
  },
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};
const payloadStr = Buffer.from(JSON.stringify(mockPayload)).toString("base64url");
const signature = Buffer.from("fakesig").toString("base64url");
const fakeJwt = `${header}.${payloadStr}.${signature}`;

const decoded = decodeJwt(fakeJwt);
assert.strictEqual(decoded.sub, mockPayload.sub, "Decoded sub must match");
assert.strictEqual(decoded.preferred_username, "raj_kumar", "Decoded username must match");

const rolesInfo = extractUserRoles(decoded);
assert(rolesInfo.roles.includes("customer"), "Roles must include customer");
assert(rolesInfo.roles.includes("manage-profile"), "Roles must include client role");
assert.strictEqual(rolesInfo.primaryRole, "customer", "Primary role should be customer");

console.log("   ✅ JWT Decoding & Role Extraction PASSED");

// 3. Test Controllers & Validations Directly
console.log("▶️  [Test 3] Testing Reverted Original & New KC Auth Controllers...");

function createMockReqRes({ body = {}, headers = {}, query = {}, method = "POST" } = {}) {
  const req = {
    method,
    body,
    headers: { ...headers },
    query,
    get: (name) => headers[name.toLowerCase()],
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    send: (data) => {
      responseData = data;
      return res;
    },
    setHeader: () => res,
  };

  return { req, res, getResult: () => ({ status: statusCode, data: responseData }) };
}

(async () => {
  // 3a: Original handleForgotPassword negative flow (missing email)
  {
    const { req, res, getResult } = createMockReqRes({ body: {} });
    await handleForgotPassword(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "Original handleForgotPassword should return 400 on empty body");
    assert.strictEqual(result.data.success, false);
  }

  // 3b: Original handleResetPassword negative flow (missing token)
  {
    const { req, res, getResult } = createMockReqRes({ body: {} });
    await handleResetPassword(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "Original handleResetPassword should return 400 on empty body");
    assert.strictEqual(result.data.success, false);
  }

  // 3c: New handleForgotKCPassword negative flow (missing email)
  {
    const { req, res, getResult } = createMockReqRes({ body: {} });
    await handleForgotKCPassword(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "New handleForgotKCPassword should return 400 on empty body");
    assert.strictEqual(result.data.success, false);
  }

  // 3d: New handleResetKCPassword negative flow (missing token)
  {
    const { req, res, getResult } = createMockReqRes({ body: {} });
    await handleResetKCPassword(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "New handleResetKCPassword should return 400 on empty body");
    assert.strictEqual(result.data.success, false);
  }

  // 3e: Login validation missing fields
  {
    const { req, res, getResult } = createMockReqRes({ body: {} });
    await handleKeycloakLogin(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "Missing username should return 400");
    assert.strictEqual(result.data.success, false);
  }

  // 3f: Refresh token missing
  {
    const { req, res, getResult } = createMockReqRes({ body: {} });
    await handleRefreshToken(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "Missing refresh token should return 400");
    assert.strictEqual(result.data.success, false);
  }

  // 3g: Update password validation
  {
    const { req, res, getResult } = createMockReqRes({ body: { newPassword: "123" } });
    await handleUpdatePassword(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 400, "Short new password should return 400");
    assert.strictEqual(result.data.success, false);
  }

  // 3h: Session check without token
  {
    const { req, res, getResult } = createMockReqRes({ method: "GET" });
    await handleGetSession(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 401, "Session check without token should return 401");
    assert.strictEqual(result.data.active, false);
  }

  // 3i: Verify reset token endpoint
  {
    const { req, res, getResult } = createMockReqRes({ body: { token } });
    await handleVerifyResetToken(req, res);
    const result = getResult();
    assert.strictEqual(result.status, 200, "Valid token verification should return 200");
    assert.strictEqual(result.data.valid, true);
    assert.strictEqual(result.data.email, mockEmail);
  }

  console.log("   ✅ Both Original & New KC Password Handlers Validated Successfully");
  console.log("\n🎉 ALL TESTS PASSED!");
  process.exit(0);
})();
