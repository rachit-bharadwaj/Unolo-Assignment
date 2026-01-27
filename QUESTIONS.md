## 1. If this app had 10,000 employees checking in simultaneously, what would break first? How would you fix it?

With 10,000 employees checking in around the same time, the first pressure points would likely be:

- The single Node.js backend instance handling many concurrent HTTP requests.
- The database layer doing concurrent writes to the `checkins` table and reads for dashboards/reports.

**What would break first**

- **Backend throughput / event loop**: If the server is running as a single process without clustering or horizontal scaling, CPU usage and event-loop latency would spike, leading to slow responses and timeouts.
- **Database contention**: A single SQLite or single-node relational database receiving thousands of writes per minute could hit I/O bottlenecks and locking issues.

**Fixes**

- **Scale the backend horizontally**:
  - Run multiple Node.js instances (e.g. using PM2 cluster mode or container replicas behind a load balancer).
  - Make the app stateless (which it mostly already is) so any instance can serve any request.
- **Move away from SQLite for production scale**:
  - Use a managed relational database (PostgreSQL/MySQL) with proper connection pooling.
  - Tune indexes on `checkins` (employee_id, checkin_time, status) to keep reads and writes efficient.
- **Introduce buffering for writes if needed**:
  - Use a lightweight queue (e.g. Redis stream, SQS, or Kafka in a larger setup) where API servers enqueue check-in events and a worker service writes them to the database.
  - This smooths write spikes and reduces lock contention.

---

## 2. The current JWT implementation has a security issue. What is it and how would you improve it?

In the current code, the JWT payload includes sensitive data:

- The token contains the user’s **password hash** (`password: user.password`) along with id, email, role, and name.

**Why this is a problem**

- JWT payloads are only base64-encoded, not encrypted. Anyone with the token (through XSS, logging, or accidental exposure) can decode it and see the password hash.
- Exposing password hashes increases the blast radius of any token leak and makes offline cracking easier if hashing parameters are not strong enough.

**Improvements**

- **Minimize JWT payload**:
  - Only include what is needed for authorization: e.g. `{ id, email, role, name }`.
  - Never include password hashes or other secrets in the token.
- **Strengthen token handling**:
  - Use a strong secret (already present via `JWT_SECRET`) stored securely (env/secret manager).
  - Set a reasonable expiry (shorter for access tokens, longer for refresh tokens if implemented).
  - Consider rotating secrets if compromised and supporting token revocation via a blacklist or changing a user’s token version.

---

## 3. How would you implement offline check-in support? (Employee has no internet, checks in, syncs later)

**Client-side (mobile/web)**

- **Local queue of offline check-ins**:
  - When the user taps “Check In” and the request fails due to network error, store the event locally (e.g. IndexedDB/LocalStorage on web, SQLite/secure storage on mobile).
  - Each record would contain: `employee_id`, `client_id`, timestamp, latitude/longitude, notes, and a temporary local ID.
- **Sync mechanism**:
  - Listen for network status changes (e.g. `window.navigator.onLine` or platform-specific APIs).
  - When back online, send a batch of pending check-ins to a dedicated endpoint like `POST /api/checkin/batch`.
  - Mark records as synced (or delete them) once the server confirms success.

**Backend**

- **Idempotent batch endpoint**:
  - Accept an array of offline check-ins, each with a client-generated local ID.
  - Use `(employee_id, client_id, checkin_time, local_id)` to deduplicate if the same payload is sent twice.
  - Return a mapping of local IDs to created `checkins.id` so the client can mark them as synced.

**Conflict / validation handling**

- If the employee is no longer assigned to a client or some check-ins fall outside expected business rules, respond with per-item errors so the client can surface issues or let the user discard/resolve them.

---

## 4. Explain the difference between SQL and NoSQL databases. For this Field Force Tracker application, which would you recommend and why?

**SQL (relational)**

- Structured tables with predefined schemas and relationships (foreign keys).
- Strong consistency and powerful querying via SQL (joins, aggregates).
- Great for transactional workloads, reporting, and data integrity.

**NoSQL (non-relational)**

- Flexible schemas (documents, key-value, wide-column, or graph).
- Often optimized for horizontal scalability and high throughput.
- Trades some relational features and strict schema for flexibility and scale.

**Recommendation for this app**

- I would choose a **SQL database** (e.g. PostgreSQL/MySQL) because:
  - The data model is naturally relational: users, clients, assignments, check-ins, and reports.
  - We need strong consistency for attendance and reporting (managers rely on accurate numbers).
  - Complex queries (e.g. per-employee stats, daily summaries, team aggregates) fit very well with SQL and indexed relational tables.
  - Scaling to tens of thousands of employees is realistic on a single or small cluster of relational instances with proper indexing and partitioning.

---

## 5. What is the difference between authentication and authorization? Identify where each is implemented in this codebase.

**Authentication**: Verifying **who** a user is.

**Authorization**: Deciding **what** an authenticated user is allowed to do.

**In this codebase**

- **Authentication**:
  - `backend/routes/auth.js`:
    - `POST /api/auth/login` verifies email and password using bcrypt and returns a JWT on success.
    - `GET /api/auth/me` reads the token and returns the current user profile.
  - `backend/middleware/auth.js`:
    - `authenticateToken` verifies the JWT and attaches `req.user`.

- **Authorization**:
  - `backend/middleware/auth.js`:
    - `requireManager` checks `req.user.role !== 'manager'` and denies access otherwise.
  - Routes that use `requireManager`, such as:
    - `GET /api/dashboard/stats` (manager dashboard).
    - `GET /api/reports/daily-summary` (daily summary report for managers).

---

## 6. Explain what a race condition is. Can you identify any potential race conditions in this codebase? How would you prevent them?

**What is a race condition?**

- A race condition occurs when the result of an operation depends on the **timing** or **interleaving** of multiple concurrent operations, and that timing is not controlled. Different execution orders can produce incorrect or inconsistent results.

**Potential race condition in this codebase**

- **Multiple concurrent check-ins**:
  - In `backend/routes/checkin.js`, the flow is:
    1. Check if there is an existing active check-in for the employee.
    2. If none, insert a new `checked_in` row.
  - If two check-in requests arrive at nearly the same time, both could pass the “no active check-in” check before either insert happens, resulting in two active check-ins for the same employee.

**How to prevent it**

- **Database-level constraint**:
  - Add a partial/conditional unique constraint ensuring at most one active check-in per employee, e.g.:
    - In a relational DB that supports it, enforce something like `UNIQUE (employee_id) WHERE status = 'checked_in'`.
  - Then handle the resulting unique-constraint violation in the API and return a clear error.
- **Transactional logic**:
  - Wrap the “check then insert” in a database transaction with appropriate isolation (e.g. `SERIALIZABLE` or row-level locks) so that only one insert can succeed.
- **Application-level guard (secondary)**:
  - Keep the current check plus insert logic, but rely on the DB constraint as the final arbiter to avoid subtle timing bugs.

