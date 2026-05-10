# Risk Register Generator — Azure Deployment Guide

An AI-powered risk register tool for project managers. Fill in project details,
get a scored and categorized risk register with mitigation plans, export to CSV.

---

## Folder structure

```
risk-register-azure/
├── frontend/
│   ├── index.html               ← The website (UI)
│   └── staticwebapp.config.json ← Azure routing config
├── api/
│   ├── host.json                ← Azure Functions runtime config
│   ├── package.json
│   └── generate-risks/
│       ├── index.js             ← The API proxy (calls Claude)
│       └── function.json        ← Function trigger config
└── README.md
```

---

## Prerequisites

- A **GitHub account** (free) — github.com
- An **Azure account** (free tier) — azure.microsoft.com/free
- An **Anthropic API key** — console.anthropic.com

---

## Step 1 — Push to GitHub

1. Go to github.com → click **New repository**
2. Name it `risk-register` → set to **Public** → click **Create**
3. Upload all files keeping the same folder structure above
   - Or use Git: `git init`, `git add .`, `git commit -m "init"`, `git remote add origin <your-repo-url>`, `git push`

---

## Step 2 — Create Azure Static Web App

This hosts the frontend AND connects to the Azure Function automatically.

1. Go to **portal.azure.com** → search "Static Web Apps" → click **Create**
2. Fill in:
   - **Subscription**: your free subscription
   - **Resource group**: create new → name it `risk-register-rg`
   - **Name**: `risk-register` (or anything you like)
   - **Plan type**: Free
   - **Region**: East US 2 (or nearest to you)
3. Under **Deployment details**:
   - Source: **GitHub**
   - Click **Sign in with GitHub** and authorize
   - Select your repository and branch (`main`)
4. Under **Build details**:
   - Build preset: **Custom**
   - App location: `/frontend`
   - Api location: `/api`
   - Output location: (leave blank)
5. Click **Review + Create** → **Create**

Azure will create a GitHub Actions workflow file in your repo automatically.
Your site will be live at `https://<random-name>.azurestaticapps.net` in ~2 minutes.

---

## Step 3 — Add your Anthropic API key

This is the most important step — the API key must NEVER go in the code.

1. In Azure Portal → go to your Static Web App resource
2. Click **Configuration** in the left sidebar
3. Click **+ Add** under Application Settings
4. Add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...` (your key from console.anthropic.com)
5. Click **OK** → then **Save**

The Azure Function will read this key from the environment at runtime.

---

## Step 4 — Test it

1. Go to your Static Web App URL (shown in the Overview page)
2. Fill in the project form and click **Generate risk register**
3. The page calls `/api/generate-risks` → Azure Function → Claude → renders results

If something doesn't work, check:
- Azure Portal → your Function App → **Functions** → `generate-risks` → **Monitor** (shows logs)
- Make sure the API key is saved correctly in Configuration

---

## Step 5 — Custom domain (optional)

If you want `riskgen.yourdomain.com`:

1. In your Static Web App → click **Custom domains** → **+ Add**
2. Enter your domain and follow the DNS instructions
3. Azure provisions a free SSL certificate automatically

---

## How it works (architecture)

```
User browser
    │
    │  GET /  →  index.html (served by Azure Static Web App)
    │
    │  POST /api/generate-risks  →  Azure Function (Node.js)
    │                                    │
    │                                    │  reads ANTHROPIC_API_KEY
    │                                    │  from Azure App Settings
    │                                    │
    │                                    └──→  api.anthropic.com/v1/messages
    │                                               │
    │  ←── JSON risk register ──────────────────────┘
    │
    renders results in browser
```

The API key never touches the browser. It lives only in Azure's secure
configuration store and is injected into the Function at runtime.

---

## Costs

| Service | Free tier | When you'd pay |
|---|---|---|
| Azure Static Web Apps | Free forever | Custom domain SSL (minimal) |
| Azure Functions | 1M calls/month free | Never at personal usage |
| Anthropic API | Pay per use | ~$0.01–0.05 per generation |

For personal portfolio use, your only cost is Anthropic API usage — a few cents per run.

---

## Updating the app

Any time you push changes to your GitHub repo's `main` branch, Azure automatically
redeploys within 1–2 minutes via the GitHub Actions workflow it created.

---

## Questions?

- Azure Static Web Apps docs: docs.microsoft.com/azure/static-web-apps
- Anthropic API docs: docs.anthropic.com
