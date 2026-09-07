# SENTINEL Vercel edge deployment

This deployment provides a Vercel-hosted public entry point for SENTINEL while
the application APIs and D1 database remain on the existing Cloudflare-backed
Sites deployment. The rewrite preserves paths, query strings, request methods,
and response cookies.

The Vercel production domain must be included in the Privy application's allowed
origins before email or wallet sign-in will work from that domain.
