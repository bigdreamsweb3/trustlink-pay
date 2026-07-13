# 1. OBJECTIVE

Fix ALL remaining TypeScript build errors in the Vercel deployment and push everything to a new branch with a pull request.

**Current Errors Found:**
1. `./app/services/privacy/device.ts:246:22` - Parameter 'row' implicitly has an 'any' type
2. `./app/services/privacy/session.ts:161:31` - Property 'unsafe' does not exist on type 'SqlFunction'

# 2. CONTEXT SUMMARY

- **Repository:** `bigdreamsweb3/trustlink-pay`
- **Branch:** `fix/device-list-typescript-error` (already exists)
- **Files with errors:**
  - `backend/app/services/privacy/device.ts` - missing type annotation
  - `backend/app/services/privacy/session.ts` - using non-existent `sql.unsafe` method

# 3. APPROACH OVERVIEW

1. Check for ALL TypeScript errors by running `npx tsc --noEmit` 
2. Fix all errors systematically
3. Commit and push to the existing branch (or create new one if needed)
4. Create/verify pull request

# 4. IMPLEMENTATION STEPS

### Step 1: Find all TypeScript errors
- **Goal:** Identify ALL files with type errors
- **Method:** Run `cd backend && npx tsc --noEmit` to see all errors
- **Reference:** backend directory

### Step 2: Fix TypeScript errors in device.ts
- **Goal:** Fix the implicit `any` type error
- **File:** `backend/app/services/privacy/device.ts`
- **Changes:** Add `DeviceRow` interface and type annotation to `row` parameter

### Step 3: Fix TypeScript errors in session.ts
- **Goal:** Fix the `sql.unsafe` error
- **File:** `backend/app/services/privacy/session.ts`
- **Issue:** `sql.unsafe` doesn't exist - need to use proper interpolation
- **Fix:** Change from `NOW() + INTERVAL '${sql.unsafe(`${ttl} hours`)}'` to using `sql` template tag properly

### Step 4: Verify all fixes
- **Goal:** Ensure TypeScript compiles without errors
- **Method:** Run `cd backend && npx tsc --noEmit`

### Step 5: Commit and push
- **Goal:** Push changes to GitHub
- **Method:** Stage, commit, and push to the branch

### Step 6: Create/verify pull request
- **Goal:** Ensure PR exists or create one
- **Method:** Use `gh pr create` or check existing PR

# 5. TESTING AND VALIDATION

- **Local Build:** `npm run build` in backend directory should complete without errors
- **Vercel Build:** Vercel deployment should succeed
- **PR Created:** Pull request should be open on GitHub
