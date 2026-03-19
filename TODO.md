# DisasterShield Fix: aiPayload is not defined

## Plan Breakdown & Steps

**Goal:** Fix ReferenceError "aiPayload is not defined" in server/index.js (/api/analyze endpoint).

### Steps:

- [ ] Step 3: Edit server/index.js – refactor aiPayload definition to top of try-block, remove any out-of-scope uses, add safeguards.
- [ ] Step 4: Update TODO.md with Step 3 completion.
- [ ] Step 5: Restart server – execute `node server/index.js`.
- [ ] Step 6: Test /api/analyze endpoint – execute curl POST test.
- [ ] Step 7: Update TODO.md with test results.
- [ ] Step 8: attempt_completion if fixed.

**Progress:** Starting Step 2.

