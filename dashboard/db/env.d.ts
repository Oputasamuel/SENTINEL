declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SENTINEL_WORKER_TOKEN?: string;
    RESEND_API_KEY?: string;
    SENTINEL_EMAIL_FROM?: string;
  }
}
