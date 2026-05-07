# Coolify Deploy

Build and deploy Docker images to [Coolify](https://coolify.io/) via GitHub Container Registry.

## Features

- Builds Docker images using `docker buildx`
- Pushes images to your container registry
- Triggers Coolify deployments via API
- Monitors deployment status with live updates
- Handles errors gracefully with detailed error messages

## Prerequisites

- Docker must be installed (included in GitHub Actions by default)
- Access to a Docker registry (e.g., GitHub Container Registry, Docker Hub)
- A Coolify instance with API access enabled
- A Coolify API token with deployment permissions

## CLI Usage

### Installation

Run directly with npx (no installation required):

```bash
npx coolify-ghcr-deploy --coolify-url https://coolify.example.com --app-name my-app --image ghcr.io/org/app:latest --coolify-token YOUR_TOKEN
```

Or install globally:

```bash
npm install -g coolify-ghcr-deploy
coolify-ghcr-deploy --coolify-url https://coolify.example.com --app-name my-app --image ghcr.io/org/app:latest --coolify-token YOUR_TOKEN
```

### CLI Options

| Option | Description | Required |
|--------|-------------|----------|
| `--coolify-url <url>` | Coolify instance URL (e.g., `https://coolify.example.com`) | Yes |
| `--app-name <name>` | Application name in Coolify | Yes |
| `--image <image>` | Docker image to deploy (e.g., `ghcr.io/org/app:latest`) | Yes |
| `--coolify-token <token>` | Coolify API token | Yes* |
| `--coolify-token-file <file>` | File containing Coolify API token | Yes* |
| `--env-file <file>` | File containing environment variables for build | No |

\* Either `--coolify-token` or `--coolify-token-file` is required.

### Environment Variable Fallbacks

All options have environment variable fallbacks:

| Option | Environment Variable |
|--------|---------------------|
| `--coolify-url` | `COOLIFY_URL` |
| `--app-name` | `APP_NAME` |
| `--image` | `IMAGE` |
| `--coolify-token` | `COOLIFY_TOKEN` |

### Examples

#### Using Command-Line Arguments

```bash
coolify-ghcr-deploy \
  --coolify-url https://coolify.example.com \
  --app-name my-app \
  --image ghcr.io/org/app:latest \
  --coolify-token $COOLIFY_TOKEN
```

#### Using Environment Variables

```bash
export COOLIFY_URL=https://coolify.example.com
export APP_NAME=my-app
export IMAGE=ghcr.io/org/app:latest
export COOLIFY_TOKEN=your-token

coolify-ghcr-deploy
```

#### Using --coolify-token-file

For improved security, read the token from a file:

```bash
echo "your-api-token" > ~/.coolify-token

coolify-ghcr-deploy \
  --coolify-url https://coolify.example.com \
  --app-name my-app \
  --image ghcr.io/org/app:latest \
  --coolify-token-file ~/.coolify-token
```

#### Using --env-file

Pass environment variables to the Docker build:

```bash
cat > .env.build << EOF
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
API_KEY=your-api-key
EOF

coolify-ghcr-deploy \
  --coolify-url https://coolify.example.com \
  --app-name my-app \
  --image ghcr.io/org/app:latest \
  --coolify-token $COOLIFY_TOKEN \
  --env-file .env.build
```

## GitHub Action Usage

Add this action to your workflow:

```yaml
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    permissions:
      contents: read
      packages: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
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
            API_KEY=${{ secrets.API_KEY }}
```

## Inputs

| Input | Description | Required |
|-------|-------------|----------|
| `coolify-url` | Coolify instance URL (e.g., `https://coolify.example.com`) | Yes |
| `app-name` | Coolify application name | Yes |
| `image` | Docker image name (e.g., `ghcr.io/org/app:latest`) | Yes |
| `coolify-token` | Coolify API token | Yes |
| `env-vars` | Environment variables in dotenv format | No |

## Outputs

| Output | Description |
|--------|-------------|
| `deployment-uuid` | UUID of the deployment in Coolify |

## Environment Variables

The `env-vars` input accepts environment variables in dotenv format:

```yaml
env-vars: |
  NODE_ENV=production
  DATABASE_URL=postgresql://user:pass@host:5432/db
  API_KEY=your-api-key
```

You can reference GitHub secrets in your environment variables:

```yaml
env-vars: |
  NODE_ENV=production
  DATABASE_URL=${{ secrets.DATABASE_URL }}
  API_KEY=${{ secrets.API_KEY }}
```

## How It Works

1. **Find Application**: Finds your application UUID in Coolify by name
2. **Build Docker Image**: Builds the Docker image using `docker buildx` with your environment variables passed as build secrets
3. **Push Image**: Pushes the image to your container registry
4. **Start Deployment**: Triggers a deployment via Coolify API
5. **Monitor Status**: Polls the deployment status until completion or failure

## Error Handling

The action will fail fast on any error:

- Missing required inputs
- Failed Docker build
- Failed Docker push
- Coolify API errors
- Deployment timeout (default: 600 seconds)
- Failed deployment status

## Security Best Practices

- Store your Coolify API token as a GitHub secret
- Use GitHub secrets for sensitive environment variables
- Use `packages: write` permission for GitHub Container Registry
- Consider using environment protection rules for production deployments

## Example: Complete Workflow

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run tests
        run: npm ci && npm test

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    permissions:
      contents: read
      packages: write
    
    environment:
      name: production
      url: https://your-app.your-domain.com
    
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
          app-name: your-app
          image: ghcr.io/${{ github.repository_owner }}/your-app:${{ github.sha }}
          coolify-token: ${{ secrets.COOLIFY_TOKEN }}
          env-vars: |
            NODE_ENV=production
            DATABASE_URL=${{ secrets.DATABASE_URL }}
            SESSION_SECRET=${{ secrets.SESSION_SECRET }}
```

## License

MIT License - see [LICENSE](LICENSE) for details.
