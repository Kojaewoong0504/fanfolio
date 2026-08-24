# 상점 실제 상품 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자에서 게시한 카드팩 상품을 팬앱 상점의 목록·상세·포인트 주문·구매 이력에 실제 연결한다.

**Architecture:** 기존 `CardPack`을 상품 구성의 소유자로 유지하고 `ShopProduct`가 판매 메타데이터와 가격을 소유한다. FastAPI 공개/인증/관리자 API를 추가하고, 실제 `/shop` 라우트는 API 상태를 렌더링하며 `?preview=shop`만 정적 시안을 유지한다.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic, vanilla admin app, React/Vite frontend, Node test runner, pytest.

---

### Task 1: 데이터 모델과 마이그레이션

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/0051_shop_products_orders.py`
- Test: `backend/tests/test_shop_models.py`

- [ ] **Step 1: Write failing model contract tests** for product fields, order snapshot fields, and product/order relationships.
- [ ] **Step 2: Run `pytest backend/tests/test_shop_models.py -q` and confirm the tables/models are missing.**
- [ ] **Step 3: Add `ShopProduct` and `ShopOrder` SQLAlchemy models with status/type constraints and indexes.**
- [ ] **Step 4: Add Alembic revision `0051_shop_products_orders.py` with foreign keys, indexes, and downgrade.**
- [ ] **Step 5: Run the focused tests and migration smoke check.**

### Task 2: Schemas, service logic, and API contracts

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services.py`
- Create: `backend/app/routers/shop.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_shop_api.py`

- [ ] **Step 1: Write failing API tests** for published catalog filtering, product detail, point order success, insufficient balance rollback, and purchase history.
- [ ] **Step 2: Run the focused tests and confirm 404/route-not-found or missing schema failures.**
- [ ] **Step 3: Add Pydantic request/response schemas and serializers using camelCase aliases.**
- [ ] **Step 4: Add a transactional point-order service that locks the balance, calls the existing point debit path, creates an order snapshot, and rolls back on validation failure.**
- [ ] **Step 5: Add `/catalog/shop/products`, `/catalog/shop/products/{id}`, `/me/shop/orders`, and `/me/shop/orders` POST routes using existing auth/database dependencies.**
- [ ] **Step 6: Run focused API tests and the existing points/card-pack test modules.**

### Task 3: Admin product management

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `admin_app/app.js`
- Modify: `admin_app/styles.css`
- Test: `backend/tests/test_admin_shop_products.py`
- Test: `admin_app/tests/shop-products.test.mjs`

- [ ] **Step 1: Write failing admin API tests** for list/create/update/publish and invalid card-pack linkage.
- [ ] **Step 2: Run the focused tests and confirm the admin routes are absent.**
- [ ] **Step 3: Implement admin CRUD routes reusing existing admin auth and card-pack lookup helpers.**
- [ ] **Step 4: Add admin navigation, list, create/edit form, publish action, and success/error states without duplicating card-pack composition UI.**
- [ ] **Step 5: Run backend admin tests and the admin app contract tests.**

### Task 4: Fan app API client and actual shop screens

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/tests/shop-api-contract.test.mjs`
- Test: `frontend/tests/shop-preview.test.mjs`

- [ ] **Step 1: Write failing frontend contract tests** for API client methods and actual route branches.
- [ ] **Step 2: Run the focused tests and confirm no shop API client or product-detail route exists.**
- [ ] **Step 3: Add typed `getShopProducts`, `getShopProduct`, `createShopOrder`, and `getShopOrders` client methods.**
- [ ] **Step 4: Add API-backed `/shop` list, `/shop/products/:id` detail, checkout submit, and `/shop/history` states while keeping preview components isolated behind `?preview=shop`.**
- [ ] **Step 5: Add responsive styles for the existing phone-width design system, including four-card rows where the current layout permits them.**
- [ ] **Step 6: Run frontend tests and verify the actual routes against a running local backend.**

### Task 5: Seed data, regression verification, and handoff

**Files:**
- Create: `backend/scripts/seed_shop_products.py`
- Modify: `docs/api-contract.md`
- Test: `backend/tests/test_shop_seed.py`

- [ ] **Step 1: Write a seed contract test** that creates one published DREAMSCAPE card-pack product without duplicating an existing pack.
- [ ] **Step 2: Implement an idempotent local seed script using existing artist/card-pack lookup conventions.**
- [ ] **Step 3: Document public/admin/authenticated shop endpoints and the explicit point-only payment limitation.**
- [ ] **Step 4: Run `pytest`, `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.**
- [ ] **Step 5: Inspect `/shop`, `/shop/products/:id`, and `/shop/history` in the browser and report any environment-dependent auth/backend limitation.**
