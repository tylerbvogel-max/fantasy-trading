# Chromebook Development Setup Guide

Complete guide to set up the Fantasy Trading development environment on a Chromebook (10GB RAM).

---

## Step 1: Enable Linux on Your Chromebook

1. Open **Settings**
2. In the left sidebar, click **Advanced** → **Developers**
3. Next to "Linux development environment", click **Turn on**
4. Follow the prompts:
   - Use the recommended disk size (10GB minimum, 20GB preferred if you have space)
   - Click **Install**
5. Wait for installation (takes a few minutes)
6. A Linux terminal will open when done

> If you don't see the Developers option, your Chromebook may need a ChromeOS update. Go to Settings → About ChromeOS → Check for updates.

---

## Step 2: Update Linux and Install Core Tools

Open the Linux terminal and run these commands one section at a time:

```bash
# Update package manager
sudo apt update && sudo apt upgrade -y

# Install essential build tools
sudo apt install -y build-essential curl wget git
```

---

## Step 3: Install Python 3.11+

```bash
# Check if Python 3.11+ is already installed
python3 --version

# If it's 3.11 or higher, skip to the next step.
# If not, install it:
sudo apt install -y python3 python3-pip python3-venv
```

---

## Step 4: Install Node.js 18+

```bash
# Install Node.js via nvm (Node Version Manager) — recommended approach
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload your shell
source ~/.bashrc

# Install Node.js 18 LTS
nvm install 18
nvm use 18

# Verify
node --version  # Should show v18.x.x
npm --version
```

---

## Step 5: Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-client

# Start the PostgreSQL service
sudo service postgresql start

# Create your database user and database
sudo -u postgres createuser --superuser $USER
createdb fantasy_trading

# Verify it works
psql fantasy_trading -c "SELECT 1;"
```

**Important**: PostgreSQL doesn't auto-start when Linux boots. You'll need to run this each time you restart Linux:
```bash
sudo service postgresql start
```

Or add it to your `.bashrc` to auto-start:
```bash
echo "sudo service postgresql start 2>/dev/null" >> ~/.bashrc
```

---

## Step 6: Install Claude Code

```bash
# Install Claude Code globally via npm
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

When you first run `claude`, it will ask you to authenticate with your Anthropic account.

---

## Step 7: Set Up the Project

```bash
# Create a projects directory
mkdir -p ~/Projects
cd ~/Projects

# Unzip the project (transfer the zip file to Linux first)
# You can drag the zip file from Chrome Downloads into the Linux Files folder
unzip fantasy-trading.zip
cd fantasy-trading

# Initialize git
git init
git add .
git commit -m "Initial V1 scaffold"
```

### Backend Setup

```bash
cd ~/Projects/fantasy-trading/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
```

Now edit the `.env` file:
```bash
nano .env
```

Set these values:
```
DATABASE_URL=postgresql+asyncpg://YOUR_USERNAME:@localhost:5432/fantasy_trading
FINNHUB_API_KEY=d631eu9r01qnpqnvehn0d631eu9r01qnpqnvehng
SECRET_KEY=pick-any-random-string-here
```

> **Note**: Replace `YOUR_USERNAME` with your Linux username (run `whoami` to check). Since we created a superuser without a password, the format is `username:@localhost`.

Save and exit nano: `Ctrl+O`, `Enter`, `Ctrl+X`

```bash
# Seed the database (creates tables, stocks, seasons, invite codes)
python -m app.seed

# ⚠️  IMPORTANT: Copy and save the admin token and invite codes that get printed!

# Start the backend server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify by opening Chrome and going to: `http://localhost:8000/docs`

You should see the Swagger API documentation.

### Mobile Setup

Open a **new terminal tab** (keep the backend running):

```bash
cd ~/Projects/fantasy-trading/mobile

# Install dependencies
npm install

# Install Expo CLI
npx expo --version  # This will auto-install if needed
```

**Before starting Expo, you need your Chromebook's local IP address:**
```bash
hostname -I | awk '{print $1}'
```

Note this IP (e.g., `192.168.1.42`).

**Update the API URL in the mobile app:**
```bash
nano src/api/client.ts
```

Change this line:
```typescript
const API_BASE = "http://localhost:8000";
```
To:
```typescript
const API_BASE = "http://YOUR_CHROMEBOOK_IP:8000";
```

Save and exit.

**Start Expo:**
```bash
npx expo start
```

---

## Step 8: Connect Your iPhone

1. **Install Expo Go** from the App Store on your iPhone
2. Make sure your **iPhone and Chromebook are on the same WiFi network**
3. When Expo starts in the terminal, it shows a QR code
4. Open your **iPhone camera** and point it at the QR code
5. Tap the notification that appears to open in Expo Go
6. The app should load!

> **Troubleshooting**: If the app can't connect, Expo might be using the wrong network interface. Try pressing `s` in the Expo terminal to switch to "tunnel" mode, which routes through Expo's servers instead of local network.

---

## Daily Development Workflow

Each time you sit down to code:

```bash
# 1. Start PostgreSQL (if not auto-starting)
sudo service postgresql start

# 2. Start backend (Terminal 1)
cd ~/Projects/fantasy-trading/backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 3. Start mobile (Terminal 2)
cd ~/Projects/fantasy-trading/mobile
npx expo start

# 4. Open Claude Code (Terminal 3)
cd ~/Projects/fantasy-trading
claude
```

---

## Using Claude Code

Once in the project directory, start Claude Code:

```bash
claude
```

Claude Code will automatically read the `CLAUDE.md` file in the project root, which has full context about the architecture, current state, and next steps.

Example prompts to continue development:
- "Build the Trade screen with stock search, buy/sell form, and confirmation modal"
- "Add the Portfolio screen showing holdings with live prices"
- "Run the backend and test the trade endpoint"
- "Help me deploy the backend to Railway"

---

## Tips for Chromebook Development

- **Terminal tabs**: Right-click the terminal title bar → "New Tab" to run multiple things
- **File access**: Linux files are in the Chrome OS file manager under "Linux files"
- **Copy/paste**: `Ctrl+Shift+C` and `Ctrl+Shift+V` in the terminal
- **VS Code** (optional): `sudo apt install -y code` or use the web version at vscode.dev
- **Low storage?** Run `du -sh ~/Projects/*` to check space usage. You can move the database to cloud (Neon/Supabase) if needed.
- **Network issues with Expo?** Use tunnel mode: press `s` then select "tunnel" in the Expo dev tools
