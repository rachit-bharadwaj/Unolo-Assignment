# Real-Time Location Tracking Architecture for Unolo

## 1. Technology Comparison

### 1.1 WebSockets

**How it works**  
WebSockets establish a persistent, full‑duplex TCP connection between client and server after an initial HTTP(s) handshake. Both sides can push messages at any time without repeated HTTP requests.

**Pros**
- Bi‑directional, low‑latency messaging; ideal for “live map” updates.
- Efficient over time: one connection per client instead of repeated HTTP requests.
- Widely supported in browsers, mobile SDKs, and backend frameworks.

**Cons**
- Requires stateful connections and connection management (reconnect, heartbeats).
- Load‑balancing needs sticky sessions or a shared pub/sub layer so any node can handle messages.
- Harder to integrate with purely serverless setups.

**When to use**
- Real‑time dashboards, chats, collaborative apps, and continuous streams of small updates, especially when the server sometimes needs to push messages to clients (e.g., managers sending alerts to field staff).

---

### 1.2 Server-Sent Events (SSE)

**How it works**  
SSE uses an HTTP connection where the server continuously pushes events to the client as a text stream. Communication is one‑way: server → client.

**Pros**
- Simple to implement on the client (EventSource API) and server.
- Built on HTTP; works well with existing infrastructure and proxies.
- Automatic reconnection built into the browser.

**Cons**
- One‑way only; the client still needs normal HTTP or another channel to send data upstream.
- Primarily optimized for browsers; mobile SDK support is less standardized.
- Uses a persistent connection per client; at 10,000+ connections, infrastructure must be tuned carefully.

**When to use**
- Real‑time dashboards where only the server pushes updates (e.g., a manager viewing live locations), and the upstream path can be simple HTTP posts from devices.

---

### 1.3 Long Polling

**How it works**  
The client sends an HTTP request and the server holds it open until new data is available or a timeout occurs. When the response completes, the client immediately issues another request.

**Pros**
- Very easy to implement on top of plain HTTP without special protocols.
- Works with almost any infrastructure, proxies, and load balancers.

**Cons**
- Inefficient: repeated HTTP headers and TLS handshakes increase overhead.
- Higher battery usage on mobile (frequent wake‑ups and network activity).
- Higher server and network costs at scale due to many requests.

**When to use**
- As a compatibility fallback when WebSockets/SSE are not available, or for low‑traffic, non‑critical real‑time use cases.

---

### 1.4 Third-Party Real-Time Services (e.g., Firebase, Pusher, Ably)

**How it works**  
A managed service provides SDKs for web/mobile that handle connections, fan‑out, and presence. Your backend writes to the provider’s API, which then delivers updates to connected clients.

**Pros**
- Offloads connection scaling, presence, and message routing to a managed platform.
- Fast to integrate; good developer experience.
- Typically provides additional features (auth integration, analytics, etc.).

**Cons**
- Vendor lock‑in and ongoing usage costs (per connection / per message).
- Regulatory / data residency concerns depending on where data flows.
- Less control over low‑level performance characteristics and debugging.

**When to use**
- Small teams that need to ship real‑time features quickly and are comfortable with recurring SaaS costs, or when operating infrastructure for real‑time messaging is not core competency.

---

## 2. Recommendation for Unolo

Given Unolo’s context:
- **Scale**: 10,000+ employees sending location updates every ~30 seconds.
- **Battery**: Mobile devices must conserve battery.
- **Reliability**: Networks are often flaky in the field.
- **Cost & team size**: Startup with a small engineering team.

I recommend a **hybrid architecture**:

- **Upstream (device → backend)**:  
  Use **periodic HTTPS requests** from the mobile app to a REST endpoint (e.g., `POST /api/location`) that batches and stores location updates.
- **Downstream (backend → manager dashboard)**:  
  Use **WebSockets** (or SSE as a fallback) to stream aggregated, near‑real‑time location data to manager dashboards.

Why this compromise:
- Upstream location reporting does not need millisecond latency; 30‑second intervals over HTTPS are simpler, battery‑friendly, and easy to secure and cache.
- Manager dashboards benefit from smooth, real‑time updates; a WebSocket channel from the dashboard to the backend (or a pub/sub layer) fits very well.
- This splits complexity: mobile stays simple (HTTP + background jobs), while the web dashboard gets a focused, well‑bounded real‑time channel.

If the team wants to minimize infrastructure work further and budget allows, using a **managed WebSocket / pub‑sub service** for the dashboard stream is a good future optimization, but I wouldn’t start there.

---

## 3. Trade-offs of the Recommended Approach

**What we gain**
- **Battery efficiency**: Periodic HTTP posts from mobile can be batched and aligned with OS background limits, reducing continuous radio usage compared to always‑on WebSockets.
- **Operational simplicity**:  
  - Mobile side uses standard REST; easier to debug and monitor.  
  - Only manager dashboards maintain real‑time connections, which are far fewer than total employees.
- **Cost control**: Fewer long‑lived connections (mostly dashboards), no immediate need for expensive third‑party services.

**What we sacrifice**
- We don’t get sub‑second location updates from every device; the granularity is the chosen interval (e.g., 30–60 seconds).
- Some complexity still exists on the backend: we must maintain WebSocket infrastructure for dashboards and a fan‑out mechanism from stored locations to active dashboards.

**When I would reconsider**
- If **update frequency** requirements increased (e.g., every 1–5 seconds) for all employees, the HTTP polling pattern from mobile would become too heavy; I would then consider:
  - Persistent WebSocket or gRPC streams from mobile devices to a dedicated real‑time ingress service.
- If the team grows and infrastructure complexity is acceptable, or if very high fan‑out is required across many dashboards, I’d consider:
  - Introducing a managed service (e.g., Pusher/Ably) or running our own message broker (e.g., Kafka + WebSocket gateways).

**At what scale it might break down**
- When the number of **simultaneous dashboards** and **location update rate** grows enough that:
  - The backend cannot efficiently query and push updated positions (e.g., many managers watching hundreds of employees each, with 1–5 second resolution).
  - The database becomes a bottleneck for both writes and read‑heavy, real‑time queries.
In that case, we’d likely need:
- More aggressive aggregation and caching (in‑memory stores like Redis) for “current position” snapshots.
- Possible sharding/partitioning of location data and more specialized time‑series or geospatial storage.

---

## 4. High-Level Implementation Plan

### 4.1 Backend Changes

1. **Location ingestion endpoint**
   - Add `POST /api/location` (authenticated) where mobile clients send:
     - `latitude`, `longitude`, `accuracy`, `timestamp`, and optionally `speed`/`heading`.
   - Store data in a `locations` table or a time‑series optimized structure:
     - Keep recent history (e.g., last N hours/days) and periodically archive or aggregate.

2. **Current position cache**
   - Maintain a “current position” per employee in a fast store (Redis or an in‑memory map backed by DB):
     - Key: `employee_id`
     - Value: latest coordinates + timestamp + basic metadata.
   - On each new location POST, update both the DB (for history) and the cache (for live views).

3. **Real-time stream to dashboards**
   - Implement a WebSocket server endpoint (e.g., `/ws/manager`) that:
     - Authenticates the manager using the existing JWT.
     - Subscribes the connection to location updates for that manager’s team.
   - When a new location event arrives:
     - Determine the affected manager(s) based on team assignments.
     - Push a small JSON payload over WebSocket with the updated employee position.

4. **Reporting and summaries**
   - Use the stored `locations` and `checkins` for:
     - Daily summary reports (already implemented).
     - Possible future analytics (distance traveled, visit durations, etc.).

### 4.2 Frontend / Mobile Changes

1. **Mobile (or mobile web) client**
   - Implement a background task / periodic job that:
     - Reads GPS location at a controlled interval (e.g., every 30–60 seconds, respecting OS limits).
     - Sends batched updates to `POST /api/location` when online.
     - Queues updates locally when offline and syncs them later (similar to the offline check‑in strategy).
   - Provide controls in the app for:
     - Enabling/disabling live tracking.
     - Showing when tracking is active and last successful sync time.

2. **Manager dashboard**
   - Add a WebSocket connection that:
     - Connects when a manager opens the map view.
     - Receives location updates and updates markers on a map component in near real time.
   - Fall back to periodic HTTP polling of “current positions” if WebSockets are unavailable.

### 4.3 Infrastructure

- Deploy the existing Node.js backend behind a load balancer that supports WebSockets (e.g., Nginx/ALB).
- Use:
  - A relational DB (PostgreSQL/MySQL) for core entities (`users`, `clients`, `checkins`).
  - A cache / pub‑sub (Redis) for:
    - Current employee positions.
    - Broadcasting updates to WebSocket servers if horizontally scaled.
- Set up monitoring (APM, logs, metrics) to track:
  - Connection counts.
  - Location ingestion rate.
  - Latency from device update to dashboard display.

This architecture keeps the system realistic for a startup (limited infra, small team) while providing a clear path to scale out as usage grows. 

