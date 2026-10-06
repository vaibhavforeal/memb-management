# Razorpay billing verification

Run `npm run build`, then `npm run test:billing:e2e` with the local development database running. The runner starts an isolated server on an available loopback port, uses synthetic business accounts, and shuts the server down afterward. The normal preview and `.env` are not modified. Synthetic businesses and accounts are removed after the tests.

Only the isolated server preloads `scripts/razorpay-test-provider.mjs`. That file requires an explicit test flag, fixed fake keys, a loopback app URL and a loopback database. It replaces outbound Razorpay API calls in that server process. Playwright supplies a simulated Checkout script; application routes, authorization, server signature verification, database writes and webhook handling all run normally. No real payment or provider request is made.

The browser suite checks admin fee configuration, owner checkout, confirmed payment history, duplicate signed webhooks, closed checkout, delayed webhook recovery, script-load errors, failed attempts, staff access, unauthenticated requests, origin checks, and forged webhooks. It captures desktop and mobile screenshots under `.local/billing-desktop.png` and `.local/billing-mobile.png`, checks page errors, and asserts the mobile viewport has no page-level horizontal overflow. `npm run test:e2e` skips this provider-specific suite unless the isolated runner is used.

Use `npm run test:billing` for concurrent database tests and `npm test` for signature and HTTP-body validation. Login rate limits remain enabled during browser tests; sessions are reused. If repeated failed runs reach the login limit, allow the normal rate-limit window to expire before rerunning.

These simulated checks do not validate Razorpay account activation, actual payment methods, capture settings, webhook delivery over the public internet, or bank settlement. Follow **Business billing with Razorpay** in [README.md](../README.md) to configure your own Test Mode credentials and verify those external boundaries before switching to Live Mode.
