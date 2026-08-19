# Profile Decorating Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current utilitarian profile/account screen with the approved playful profile-decorating experience while keeping profile persistence and login-specific security behavior correct.

**Architecture:** Keep the existing `Settings` component and API contracts as the feature boundary. Update the profile screen to use the approved hero/progress/form hierarchy, make artist and member selections visibly single-select, and route password changes to a separate screen for email users only. Social users receive provider-security guidance instead of password controls.

**Tech Stack:** React, TypeScript, Vite, CSS, FastAPI, pytest, Node test runner.

---

### Task 1: Lock the profile screen contract

**Files:**
- Modify: `frontend/src/components/Settings.tsx`
- Test: `frontend/tests/settings-layout.test.mjs`

- [ ] **Step 1: Add structural assertions for the approved profile flow**

Assert the source contains the profile-decorating title, progress cue, single-selection field labels, the email-only password link, and the social-provider security copy. Assert that the old profile settings shortcuts are absent.

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `node --test tests/settings-layout.test.mjs`
Expected: the new profile-specific assertions fail before implementation.

- [ ] **Step 3: Implement the approved screen structure**

Keep existing profile save and image upload handlers. Replace the current account-management composition with:

```tsx
<section className="profile-decorate-screen" aria-label="프로필 꾸미기">
  <header className="profile-decorate-topbar">...</header>
  <div className="profile-decorate-hero">...</div>
  <div className="profile-decorate-progress">...</div>
  <section className="profile-decorate-form">
    <label>닉네임</label>
    <input ... />
    <label>좋아하는 아티스트</label>
    <select ... />
    <label>좋아하는 멤버</label>
    <select ... />
  </section>
  {user.hasPassword ? <button>계정 보안 · 비밀번호 변경</button> : <p>소셜 계정에서 보안을 관리해요.</p>}
  <button>저장하고 완료</button>
  <button>나중에 하기</button>
</section>
```

The artist select remains a single native selection and resets the member selection when the artist changes. The member select remains single-select and is disabled until members are available.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `node --test tests/settings-layout.test.mjs`
Expected: PASS.

### Task 2: Implement the visual reference faithfully

**Files:**
- Modify: `frontend/src/reference.css`

- [ ] **Step 1: Add the mobile canvas and decorative hierarchy styles**

Use `var(--fan-shell)` for the centered mobile canvas, preserve the pale lavender background, add the decorative hero line treatment with existing CSS-safe surfaces, and match the reference spacing: top bar, avatar hero, progress cue, form rows, security link, and bottom action area.

- [ ] **Step 2: Add responsive and interaction states**

Include focus-visible outlines, disabled member styling, save/loading states, and safe bottom padding. Keep the screen inside the 430px app shell on desktop browser viewports.

- [ ] **Step 3: Run frontend tests, typecheck, build, and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all tests pass, TypeScript build succeeds, and lint reports no errors.

### Task 3: Separate password management by login method

**Files:**
- Modify: `frontend/src/components/Settings.tsx`
- Modify: `frontend/src/reference.css`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/routers/fan.py`
- Modify: `frontend/src/api/client.ts`
- Test: `backend/tests/contract/test_fan_experience.py`

- [ ] **Step 1: Add contract coverage for account-specific security presentation**

Verify email accounts expose the password-change entry point and social accounts expose only provider-security guidance. Keep the existing backend password route behavior: password-hash users can change passwords, social users receive `PASSWORD_NOT_CONFIGURED`.

- [ ] **Step 2: Implement the separate password screen entry point**

Open the existing dedicated password panel/screen from the email-only security link. Keep current-password, new-password, confirmation validation and API submission. Do not render password inputs for users without `hasPassword`.

- [ ] **Step 3: Run backend and frontend contract tests**

Run: `./.venv/bin/pytest tests/contract/test_fan_experience.py -q` and `npm test`
Expected: backend contract tests and all frontend tests pass.

### Task 4: Browser visual QA

**Files:**
- Create: `design-qa.md`

- [ ] **Step 1: Open the running local app in the Codex in-app browser**

Use the existing localhost tab, authenticate only through the existing app state, open the profile editor, and inspect the 430px mobile canvas.

- [ ] **Step 2: Verify primary interactions**

Verify back navigation, profile image selection affordance, artist-to-member dependency, profile save, and the email/social security difference without submitting a real password change.

- [ ] **Step 3: Record the visual QA result**

Compare the same mobile viewport against the approved reference. Save `design-qa.md` with `final result: passed` only after layout, hierarchy, and interaction checks pass.
