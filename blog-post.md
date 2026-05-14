---
image: ""
---

# Vercel-Style Deploys on Your Own Hardware

*For developers running Coolify who ship containers through GitHub Container Registry.*

**Introducing coolify-deploy — `git push` to your own server with the simplicity of a platform.**

I used to host everything on Vercel and honestly it was great. Connect a repo, push, your app is live — simple enough that it spoils you fast.

When I outgrew the free tier I upgraded to Pro at $20/month. My first Pro bill came in at $41: an extra $21 in CPU overages I hadn't expected. Annoying, but not the real problem.

The real problem is that Vercel doesn't let you set a spending limit. Someone could DoS your app while you're asleep and you'd wake up to a $10,000 bill with no recourse. It's 2026 — AI crawlers and bots are everywhere, constantly hitting endpoints, triggering serverless functions. Vercel charges for CPU execution time, not bandwidth, so every bot visit costs you money. This isn't a theoretical edge case. I couldn't justify the risk anymore.

So I moved to a dedicated [Hetzner](https://www.hetzner.com/) server running [Coolify](https://coolify.io/). Fixed monthly cost, open-source PaaS, no usage billing, no surprises.

But now I had a different problem: I wanted to build my app as a container image. The existing Coolify deploy actions are simple — push to deploy, they just work. The difference is the artifact, not the workflow. When Coolify builds your code on the host, you get a one-off build tied to that one machine. I wanted a single image that runs identically everywhere: my laptop, CI, production. Same bytes, same container. So I built [coolify-deploy](https://github.com/assaf/coolify-deploy) to bridge that gap.

I'm not a big fan of Docker. It's over-complicated and a resource hog, but a container is still the best way to get a consistent image you can test locally and ship to production. I use [Colima](https://colima.run/) instead of Docker Desktop — keeps the CPU and memory usage way down. My deploy script starts it, builds and pushes the image, then shuts it down.

![pipeline: git push → build → registry → deploy → healthcheck](pipeline.svg)

## Usage

**GitHub Action:**

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

**CLI:**

```bash
npx coolify-ghcr-deploy \
  --coolify-url https://coolify.example.com \
  --app-name my-app \
  --image ghcr.io/org/app:latest \
  --coolify-token $COOLIFY_TOKEN
```

## Get It

The repo is at [github.com/assaf/coolify-deploy](https://github.com/assaf/coolify-deploy). MIT license, on npm, in the GitHub Marketplace. Add it to your workflow, run the CLI to test it. If something breaks, open an issue — I use this daily.

— Assaf
