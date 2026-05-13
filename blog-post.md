# Vercel-Style Deploys on Your Own Hardware

*For developers running Coolify who ship containers through GitHub Container Registry.*

**Introducing coolify-deploy — `git push` to your own server with the simplicity of a platform.**

I run my apps on a Hetzner server with Coolify. An open-source platform that gives you the Heroku/Vercel experience on your own hardware. But for the longest time, my deploy workflow had a gap.

This is what I wanted:

```text
git push → build → push to registry → deploy to Coolify → verify it's healthy
```

Dead simple. Like Vercel. But on my metal.

The existing Coolify deploy actions didn't fit. They're built around pulling code directly from Git repos on the Coolify host — not how I work. I build container images. I push them to GitHub Container Registry. I want Coolify to pull from there. And I want the whole thing automated.

So I built it.

**coolify-deploy** handles all of it: build your Docker image with `buildx`, push it to GHCR, hit the Coolify API to trigger a deployment, watch it with a live spinner, and verify your healthcheck endpoint responds — all in one command.

## The Stack

**Hetzner** — a dedicated server. It's cheap, it's fast, and nobody else touches it.

**Coolify** — the open-source PaaS that manages apps, databases, domains, SSL. Feels like a platform without the monthly bill.

**GitHub Container Registry** — where images live. Private, free for public repos, right next to your code. No extra service to configure.

**Infisical** — where secrets live. I keep everything in Infisical. A quick CLI pull dumps them into the `env-vars` input, and they're available at build time without ever touching a `.env` file. Environment variables get injected at build time as Docker secrets — nothing leaks into image layers.

coolify-deploy is the glue that makes it feel like a platform.

## What It Actually Does

Three things it handles so you don't have to:

**Build & Push.** `buildx` builds your image, passes env vars as Docker secrets, pushes to your registry.

**Deploy & Monitor.** Triggers a Coolify deployment via API with `force=true`, polls with a live spinner, surfaces errors immediately — no staring at dashboards.

**Verify & Heal.** Fetches your app's FQDN from Coolify, auto-configures the healthcheck endpoint, retries until it returns 2xx or the timeout expires. If your app takes a minute to warm up, it waits.

## Why Not Use the Other Coolify Actions?

Fair question. The existing Coolify GitHub Actions pull source code from your Git repo directly onto the Coolify host and build there. That works if you want Coolify to own the whole pipeline. But here's the thing: if you're already building container images — publishing to GHCR, scanning them, running them through CI — those actions fight your workflow. They assume the build happens on the Coolify server.

This action is container-first. You build the image wherever and however you want. You push it to GHCR. Coolify pulls it from there and deploys it. No source code touches the Coolify host. No duplicate builds. One pipeline, one image, one source of truth.

If you Google "coolify deploy github action," this is the one for container workflows.

## How Insanely Simple It Is

**As a GitHub Action** — drop this in `.github/workflows/deploy.yml`:

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Log in to GitHub Container Registry
    uses: docker/login-action@v3
    with:
      registry: ghcr.io
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}

  - name: Deploy to Coolify
    uses: assaf/coolify-ghcr-deploy@v1
    with:
      coolify-url: https://coolify.your-domain.com
      app-name: your-app-name
      image: ghcr.io/your-org/your-app:latest
      coolify-token: ${{ secrets.COOLIFY_TOKEN }}
      env-vars: |
        NODE_ENV=production
        DATABASE_URL=${{ secrets.DATABASE_URL }}
```

**As a CLI** — no install needed:

```bash
npx coolify-ghcr-deploy \
  --coolify-url https://coolify.example.com \
  --app-name my-app \
  --image ghcr.io/org/app:latest \
  --coolify-token $COOLIFY_TOKEN
```

## What's New in v1.2.0

The healthcheck got a real overhaul — it now fetches your app's FQDN from Coolify, auto-configures the endpoint, and retries smarter so a slow-warming app doesn't fail the build. Plus a handful of bug fixes. [Full changelog →](https://github.com/assaf/coolify-deploy/blob/main/CHANGELOG.md)

## Why I Built This

I wanted `git push` to be the last manual step. Vercel and Railway get this right, but they charge for it, and you don't own the hardware. Coolify gives you the platform. GHCR gives you the registry. Hetzner gives you the compute. Nobody had wired them together into a container-first push-to-deploy pipeline. So I built the missing piece.

The first time I ran this: three apps, three `git push` commands, and ten minutes later everything was live. I closed my laptop and went for a walk.

## Try It

**[github.com/assaf/coolify-deploy](https://github.com/assaf/coolify-deploy)**

Add the action to your workflow. Run the CLI to test. Star the repo if it saves you time. Open an issue if something breaks — I use this daily, so I'll fix it fast.

— Assaf
