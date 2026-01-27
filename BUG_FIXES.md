## Bug 1: Login sometimes fails even with correct credentials

- **Location**: `backend/routes/auth.js`, lines 26–32
- **What was wrong**: The password check used `bcrypt.compare` without `await`, so it returned a Promise instead of a boolean. This meant the code was not actually waiting for the password comparison result, leading to incorrect authentication logic.
- **How I fixed it**: Changed the password comparison to `await bcrypt.compare(password, user.password)` and kept the existing conditional check on the resulting boolean.
- **Why this fix is correct**: `bcrypt.compare` is asynchronous and returns a Promise; using `await` ensures the code waits for the actual comparison result before deciding whether to accept or reject the login. This makes the login behavior consistent and correctly validates the hashed password against the provided one.

