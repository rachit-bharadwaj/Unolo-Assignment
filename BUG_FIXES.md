## Bug 1: Login sometimes fails even with correct credentials

- **Location**: `backend/routes/auth.js`, lines 26–32
- **What was wrong**: The password check used `bcrypt.compare` without `await`, so it returned a Promise instead of a boolean. This meant the code was not actually waiting for the password comparison result, leading to incorrect authentication logic.
- **How I fixed it**: Changed the password comparison to `await bcrypt.compare(password, user.password)` and kept the existing conditional check on the resulting boolean.
- **Why this fix is correct**: `bcrypt.compare` is asynchronous and returns a Promise; using `await` ensures the code waits for the actual comparison result before deciding whether to accept or reject the login. This makes the login behavior consistent and correctly validates the hashed password against the provided one.

## Bug 2: Check-in form doesn't submit properly

- **Location**: `frontend/src/pages/CheckIn.jsx`, lines 58–84
- **What was wrong**: The `handleCheckIn` function was used as a form `onSubmit` handler but did not call `e.preventDefault()`. As a result, the browser performed a full page reload on submit, interrupting the React-controlled flow and making the check-in behavior unreliable or appear as if it failed.
- **How I fixed it**: Added `e.preventDefault();` as the first line inside `handleCheckIn` so that the form submission is handled entirely by React without triggering the browser's default navigation.
- **Why this fix is correct**: In React, when using a form `onSubmit` handler, preventing the default browser submission is required to keep control within the SPA. With `e.preventDefault()`, the app can reliably execute the async API call, update state, and show success/error messages without unintended page reloads.

## Bug 3: Dashboard shows incorrect data for some users

- **Location**: `frontend/src/pages/Dashboard.jsx`, lines 13–20
- **What was wrong**: The dashboard endpoint selection used `user.id === 1` to decide whether to call the manager stats API, assuming user with ID 1 is always the manager. This breaks when another user has manager role but a different ID, causing them to see the employee dashboard or incorrect data.
- **How I fixed it**: Changed the endpoint selection logic to use the user's `role` (`user.role === 'manager' ? '/dashboard/stats' : '/dashboard/employee'`) instead of hardcoding an ID check.
- **Why this fix is correct**: The backend already enforces manager access using the `role` in JWT; basing the frontend behavior on `role` keeps it consistent with the authorization logic and works for any manager user, regardless of their numeric ID.

