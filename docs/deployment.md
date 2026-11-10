# EC2 Production Deployment

The repository does not manage Nginx. Host Nginx/Certbot are installed and configured manually on Ubuntu.

1. Provision EC2 Ubuntu 24.04 + Elastic IP.
2. Install Docker Engine and Docker Compose plugin.
3. Install host Nginx and Certbot separately.
4. Clone repository to `/var/www/emxin-platform`.
5. `cp .env.example .env` and fill all required values.
6. `docker compose up -d --build`.
7. Verify `docker compose ps` and backend health on `127.0.0.1:8430/health`.
8. Create your own host Nginx server blocks that proxy:
   - frontend -> `127.0.0.1:4310`
   - admin -> `127.0.0.1:4320`
   - backend -> `127.0.0.1:8430`
9. Test host Nginx and reload it.
10. Issue SSL with Certbot for your chosen domains.
11. Configure Cloudflare DNS/proxy as desired.
