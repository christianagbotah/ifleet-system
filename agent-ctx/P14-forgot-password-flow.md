---
Task ID: P14-forgot-password-flow
Agent: Main Agent
Task: Implement complete "Forgot Password / Password Reset" flow

Work Log:

### 1. Database Schema Changes
- Added `PasswordResetToken` model to `prisma/schema.prisma`
  - id (String, uuid, primary key)
  - userId (String, references User with onDelete Cascade)
  - token (String, unique, VarChar(64))
  - expiresAt (DateTime, 1 hour from creation)
  - usedAt (DateTime?, nullable)
  - createdAt (DateTime, default CURRENT_TIMESTAMP)
  - Indexes on userId, token, expiresAt
- Added `passwordResetTokens` relation to `User` model
- Ran `prisma db push` and `prisma generate` successfully

### 2. Backend Auth Utils (`src/lib/auth-utils.ts`)
- Added `generateResetToken()` — generates 32-byte (64 hex char) cryptographically secure random token using `crypto.randomBytes()`
- Added `validatePassword(password)` — validates min 8 chars, max 128 chars

### 3. API Endpoints Created
- `src/app/api/auth/forgot-password/route.ts` (POST)
  - Accepts `{ email }`, normalizes email
  - Finds user by email, checks active status and password existence
  - Invalidates existing unused reset tokens
  - Generates new token with 1-hour expiry
  - Sends branded HTML email with reset button + 8-char short code
  - Always returns 200 (never reveals if email exists)
  - In dev mode: returns `devToken` and `devResetUrl` for testing
  - Rate limited: 5 requests per 15 minutes

- `src/app/api/auth/reset-password/route.ts` (POST)
  - Accepts `{ token, newPassword }`
  - Validates token (exists, not expired, not used)
  - Validates password (min 8 chars)
  - Checks user is active
  - Hashes password with bcrypt, updates user
  - Marks token as used in a DB transaction
  - Invalidates all other unused tokens for the user
  - Rate limited: 5 requests per 15 minutes

- `src/app/api/auth/verify-reset-token/route.ts` (GET)
  - Accepts `?token=xxx`
  - Returns `{ valid, user: { name, email }, expiresIn }` for valid tokens
  - Returns `{ valid: false, error }` for invalid/expired/used tokens

### 4. Login UI Updates (`src/components/auth/LoginView.tsx`)
- Refactored into multi-view SPA with `AnimatePresence` transitions
- **Login Form**: Added "Forgot Password?" link below submit button
- **Forgot Password Form**: Email input → sends reset request → shows dev token in dev mode
- **Reset Password Form**: Token input with debounced verification (500ms), new password, confirm password, strength validation, match checking
- **Reset Success View**: Success animation with "Sign In Now" button
- All forms maintain the amber/Ghana branding style
- Smooth framer-motion transitions between views
- Back navigation links on every view

### Files Created
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/api/auth/verify-reset-token/route.ts`

### Files Modified
- `prisma/schema.prisma` — Added PasswordResetToken model, User relation
- `src/lib/auth-utils.ts` — Added generateResetToken(), validatePassword()
- `src/components/auth/LoginView.tsx` — Complete rewrite with multi-view flow

### Verification
- `bun run lint` passes with zero errors
- `prisma db push` applied schema successfully
