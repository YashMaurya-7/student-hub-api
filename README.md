hello, Currently i am working on a small project. if i explain about my project so this is basically a platform where we can buy buy or sell
books or notes. this project is mainly for students .
as we all know that after passing semester or class our books or notes remain untouche, now no need to worry here you can trade. 

## Password-reset email setup

This backend uses the Resend HTTPS API for emails. This is required when the
API runs on Render's free plan because SMTP ports (including Gmail's port 587)
are blocked there.

1. Create a Resend account, verify a sending domain, and make a `sending_access` API key.
2. Copy `.env.example` to `.env` for local development and fill in the real values.
3. In Render, add the same `RESEND_API_KEY` and `EMAIL_FROM` values in the service's Environment settings.
4. Redeploy the backend, then call `GET /api/test-email` to confirm delivery.

Keep `.env` private. Do not put API keys, database passwords, or OTPs in the frontend.
