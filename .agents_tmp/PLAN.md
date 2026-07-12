# 1. OBJECTIVE

Fix the TypeScript build error in the Vercel deployment (`./app/services/privacy/device.ts:246:22` - Parameter 'row' implicitly has an 'any' type) and push the changes to GitHub with a pull request.

# 2. CONTEXT SUMMARY

- **Repository:** `bigdreamsweb3/trustlink-pay`
- **Build Error:** TypeScript compilation fails because the `row` parameter in `.map()` callback lacks explicit type annotation
- **File:** `backend/app/services/privacy/device.ts`
- **Issue Location:** Line 246 - `result.map((row) => ({`
- **Current Branch:** Based on Vercel output, clone is from `docs/tsn-whitepaper` branch

# 3. APPROACH OVERVIEW

1. Add a `DeviceRow` interface to define the database row type
2. Add explicit type annotation `(row: DeviceRow)` to the `.map()` callback
3. Create a new branch (not on default branch to avoid direct pushes)
4. Commit and push changes
5. Create a pull request using GitHub CLI

# 4. IMPLEMENTATION STEPS

### Step 1: Add type definition and fix the type error
- **Goal:** Fix the TypeScript implicit `any` error
- **File:** `backend/app/services/privacy/device.ts`
- **Changes:**
  1. Add a new interface `DeviceRow` before the `listUserDevices` function
  2. Change `(row)` to `(row: DeviceRow)` in the `.map()` callback

```typescript
interface DeviceRow {
  id: string;
  user_id: string;
  device_id: string;
  device_signing_public_key: string;
  device_encryption_public_key: string;
  status: string;
  permissions: SessionPermissions;
  created_at: Date;
  last_used_at: Date | null;
}
```

### Step 2: Verify the fix compiles
- **Goal:** Ensure TypeScript compiles without errors
- **Method:** Run `npm run build` or `npx tsc` in the backend directory

### Step 3: Create new branch and commit
- **Goal:** Create a descriptive feature branch
- **Method:** 
  - Check current branch
  - Create new branch (e.g., `fix/device-list-typescript-error`)
  - Stage and commit the changes

### Step 4: Push to remote
- **Goal:** Push the branch to GitHub
- **Method:** `git push -u origin fix/device-list-typescript-error`

### Step 5: Create pull request
- **Goal:** Open a PR for review
- **Method:** Use `gh pr create` to open a pull request against the main branch
- **Check:** Look for existing PR template and use it if available

# 5. TESTING AND VALIDATION

- **Local Build:** `npm run build` in backend directory should complete without TypeScript errors
- **Vercel Build:** The Vercel deployment should complete successfully with the fix
- **PR Created:** A pull request should be created on GitHub with the fix
- **PR Link:** Provide the user with the PR URL after creation
