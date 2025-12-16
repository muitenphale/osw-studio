# Server Mode - Self-Hosting Guide

Self-host OSW Studio with persistence, authentication, and static site publishing.

---

## Overview

OSW Studio supports two deployment modes:

- **Browser Mode** (default): Pure client-side application using IndexedDB
- **Server Mode**: Full-stack deployment with publishing

Server Mode adds:
- Local database for persistent storage (no external database needed)
- Admin authentication with JWT sessions
- Sites publishing system with static site serving
- Project sync between browser and server
- Built-in analytics and compliance features

---

## Browser Mode vs Server Mode

### Browser Mode (Default)

**Characteristics:**
- ✅ No backend required
- ✅ Deploy to any static host (Vercel, Netlify, GitHub Pages, HuggingFace)
- ✅ Zero configuration
- ✅ Complete privacy (data never leaves browser)
- ❌ No multi-user support
- ❌ No server-side persistence
- ❌ No static site publishing

**Use Cases:**
- Personal development environment
- Quick prototyping
- Privacy-focused workflows
- Static deployment (HuggingFace Spaces)

### Server Mode

**Characteristics:**
- ✅ Local persistence (no external database)
- ✅ Admin authentication
- ✅ Multiple sites per project
- ✅ Static site publishing at `/sites/{siteId}/`
- ✅ Built-in analytics
- ✅ Project sync (browser ↔ server)
- ❌ Requires persistent file system
- ❌ Requires server hosting

**Use Cases:**
- Production deployments
- Multi-user environments
- Publishing static sites
- Persistent project storage

---

## Project Sync

Server Mode uses a hybrid storage approach: projects are edited locally in the browser (for speed) and synced to the server (for persistence). This gives you the best of both worlds - fast local editing with server-side backup.

### How Sync Works

**Automatic Push (on save):**
When you save a project in Server Mode, it automatically syncs to the server. You'll see a brief "Project synced ✓" notification.

**Automatic Pull (on load):**
When you open the Project Manager, OSW Studio checks for any updates from the server and pulls them automatically. Projects that exist on the server but not locally are downloaded.

**Manual Sync:**
For bulk operations or troubleshooting, use the Sync button in the sidebar. This opens a dialog where you can:
- **Push to Server** - Upload all local projects to the database
- **Pull from Server** - Download all server projects to your browser

### When to Use Manual Sync

- **Setting up a new browser** - Pull to populate your IndexedDB from the server
- **After server restore** - Pull to get the restored data locally
- **Troubleshooting** - Force push/pull if auto-sync isn't working

---

## Quick Start

### 1. Configure Environment

Create `.env` file in project root:

```bash
# Enable Server Mode
NEXT_PUBLIC_SERVER_MODE=true

# Session security (generate with: openssl rand -base64 32)
SESSION_SECRET=your_random_secret_here

# Admin password
ADMIN_PASSWORD=your_secure_password_here

# Optional: Analytics secret
ANALYTICS_SECRET=your_analytics_secret_here

# Optional: App URL (for SEO/sitemaps)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 2. Start Server

```bash
npm install
npm run dev
```

SQLite databases are created automatically:
- `data/osws.sqlite` - Core database (projects, templates, skills)
- `sites/{siteId}/site.sqlite` - Per-site databases (files, settings, analytics)

### 3. Access Application

- **Studio**: http://localhost:3000/
- **Admin panel**: http://localhost:3000/admin/login
- **Published sites**: http://localhost:3000/sites/{siteId}/

**Login with** ADMIN_PASSWORD from .env

---

## Deployment Options

> ⚠️ **Important**: Server Mode requires **persistent file system** storage because published sites are written to `/public/sites/` and databases are stored locally. Serverless platforms like Vercel, Netlify, and Cloudflare Workers **will not work** for Server Mode.

### Option 1: Railway (Recommended)

**Why**: Simple setup, persistent storage, usage-based pricing

**Pricing**: $5/month minimum (includes $5 in usage credits). Free trial: 30 days with $5 credits.

**Steps:**

1. **Create Railway Account:**
   - Go to https://railway.app
   - Sign up with GitHub

2. **New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your OSW Studio fork

3. **Configure Variables:**
   - Go to project variables
   - Add:
     ```
     NEXT_PUBLIC_SERVER_MODE=true
     SESSION_SECRET=<generate>
     ADMIN_PASSWORD=<your password>
     NEXT_PUBLIC_APP_URL=${{ RAILWAY_PUBLIC_DOMAIN }}
     ```

4. **Deploy:**
   - Railway auto-deploys on push
   - Access at: `https://your-project.up.railway.app`

---

### Option 2: VPS (Full Control)

**Why**: Complete control, custom domains, lowest cost at scale

**Requirements:**
- Ubuntu 22.04+ server
- SSH access
- Domain (optional)

**Steps:**

1. **Install Dependencies:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Node.js 18+
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs

   # Install git
   sudo apt install -y git
   ```

2. **Clone and Configure:**
   ```bash
   # Clone repository
   git clone https://github.com/o-stahl/osw-studio.git
   cd osw-studio

   # Install dependencies
   npm install

   # Create .env
   nano .env
   ```

   Paste:
   ```
   NEXT_PUBLIC_SERVER_MODE=true
   SESSION_SECRET=<generate with: openssl rand -base64 32>
   ADMIN_PASSWORD=<your password>
   NEXT_PUBLIC_APP_URL=http://your-domain.com
   ```

3. **Build and Start:**
   ```bash
   # Production build
   npm run build

   # Start with PM2 (process manager)
   sudo npm install -g pm2
   pm2 start npm --name "osw-studio" -- start
   pm2 save
   pm2 startup
   ```

4. **Setup Nginx (Reverse Proxy):**
   ```bash
   sudo apt install -y nginx
   sudo nano /etc/nginx/sites-available/osw-studio
   ```

   Paste:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable:
   ```bash
   sudo ln -s /etc/nginx/sites-available/osw-studio /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

5. **Setup SSL (Let's Encrypt):**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

**Access:**
- http://your-domain.com (redirects to HTTPS)
- https://your-domain.com/admin/login

---

## Publishing Sites

Once Server Mode is running, you can publish sites directly from OSW Studio.

### How Publishing Works

1. **Create a Site** from any project
2. **Configure Settings**: Scripts, analytics, SEO, compliance
3. **Click "Publish"**: Static builder compiles project files
4. **Site Goes Live** at: `https://your-osw-instance.com/sites/{siteId}/`

### Creating a Site

**From Projects View:**
1. Right-click on a project card
2. Select **"Create Site"**
3. Enter site name
4. Click **"Create Site"**

**From Sites View:**
1. Click **"+ New Site"** button
2. Select source project
3. Enter site details
4. Click **"Create Site"**

### Site Settings

**General:**
- Site name
- URL slug (optional)
- Custom domain (advanced - see below)
- Under construction mode

**Scripts:**
- Head scripts (analytics, meta tags)
- Body scripts (chat widgets, tracking)
- Async/defer options

**CDN Resources:**
- External CSS/JS libraries
- Font imports
- Icon libraries

**Analytics:**
- Built-in (privacy-focused, no cookies)
- Google Analytics 4
- Google Tag Manager
- Plausible
- Custom tracking

**SEO:**
- Meta title/description
- Open Graph tags
- Twitter Card
- Canonical URLs
- Auto-generated sitemap.xml and robots.txt

**Compliance:**
- Cookie consent banner
- Opt-in/opt-out modes
- Privacy policy links
- GDPR/CCPA compliance

### Publishing Workflow

1. Create/edit site settings
2. Click **"Save & Close"**
3. Click **"Publish Now"** (or right-click site → Publish)
4. Static builder runs:
   - Loads project files from server
   - Compiles Handlebars templates
   - Injects configured settings (scripts, analytics, SEO)
   - Generates sitemap.xml and robots.txt
   - Writes to `/public/sites/{siteId}/`
5. Site is live!

### Accessing Published Sites

**Default URL:**
```
https://your-osw-instance.com/sites/{siteId}/
```

**Clean URLs** (Next.js rewrites):
```
/sites/{siteId}/about → /sites/{siteId}/about.html
/sites/{siteId}/blog/post → /sites/{siteId}/blog/post.html
```

### Managing Sites

**View Sites**: Navigate to Sites page (Server Mode only)

**Site Actions** (right-click menu):
- View Live
- Settings
- Republish
- Copy Link
- View Source Project
- Analytics Dashboard
- Capture Thumbnail
- Unpublish
- Delete

**Unpublish**: Disables site but keeps settings (can re-publish later)

**Delete**: Permanently removes site and settings

---

## Custom Domains (Advanced)

**⚠️ Note**: This section is for advanced users with sysadmin knowledge. OSW Studio does **not** handle DNS or reverse proxy configuration automatically.

### Overview

By default, published sites are available at:
```
https://your-osw-instance.com/sites/{siteId}/
```

You can configure a custom domain (e.g., `sweetcandies.com`) to point to your site using a reverse proxy. OSW Studio will then use your custom domain in SEO meta tags, sitemaps, and canonical URLs.

### Prerequisites

- Domain you control
- Access to DNS records
- Reverse proxy (Nginx, Caddy, or Apache)
- SSL certificate (Let's Encrypt recommended)

### Architecture

```
User's Browser
    ↓
sweetcandies.com (DNS)
    ↓
Reverse Proxy (Nginx)
    ↓
your-osw-instance.com/sites/abc123/
    ↓
Static files served
```

### Setup Steps

#### 1. Configure DNS

Point your domain to your server's IP:

**For root domain** (`sweetcandies.com`):
```
Type: A
Name: @
Value: 123.45.67.89 (your server IP)
TTL: 3600
```

**For subdomain** (`www.sweetcandies.com`):
```
Type: CNAME
Name: www
Value: your-osw-instance.com
TTL: 3600
```

Wait for DNS propagation (usually < 1 hour, up to 48 hours).

#### 2. Configure Reverse Proxy

**Nginx Example:**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sweetcandies.com www.sweetcandies.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sweetcandies.com www.sweetcandies.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/sweetcandies.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sweetcandies.com/privkey.pem;

    # Proxy to OSW Studio site
    location / {
        proxy_pass https://your-osw-instance.com/sites/abc123/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rewrite location headers
        proxy_redirect https://your-osw-instance.com/sites/abc123/ /;
    }
}
```

Save to `/etc/nginx/sites-available/sweetcandies.com`

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/sweetcandies.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 3. Setup SSL

```bash
sudo certbot --nginx -d sweetcandies.com -d www.sweetcandies.com
```

#### 4. Configure Custom Domain in OSW Studio

1. Go to Sites → Your Site → Settings
2. Navigate to **General** tab
3. Enter custom domain: `sweetcandies.com`
4. Save and republish

OSW Studio will now use `sweetcandies.com` in:
- SEO meta tags
- Sitemap.xml URLs
- Open Graph URLs
- Canonical URLs

### Caddy Example (Easier)

Caddy automatically handles HTTPS with Let's Encrypt:

```caddy
sweetcandies.com, www.sweetcandies.com {
    # Rewrite all requests to site path
    rewrite * /sites/abc123{uri}

    reverse_proxy your-osw-instance.com {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

**Note**: The `rewrite` directive must be outside `reverse_proxy`. Caddy rewrites the URI first, then proxies to the backend.

### What OSW Studio Does

- ✅ Stores custom domain in database
- ✅ Uses it for SEO meta tags
- ✅ Generates sitemap.xml with custom domain
- ✅ Updates canonical URLs

### What OSW Studio Doesn't Do

- ❌ DNS management
- ❌ Reverse proxy configuration
- ❌ SSL certificate generation
- ❌ Domain validation

---

## Troubleshooting

### Database Issues

**Symptoms**: "Failed to initialize database"

**Solutions**:
1. Check write permissions on `data/` directory
2. Ensure disk space is available
3. Check file system supports SQLite (most do)
4. Try deleting `data/osws.sqlite` and restarting (loses data)

### Migration Failures

**Symptoms**: Tables not created, "relation does not exist"

**Solutions**:
1. Migrations run automatically on first request
2. Check terminal logs for errors
3. Restart the server to trigger migrations

### Publishing Errors

**Symptoms**: Site not building, empty `/public/sites/`

**Solutions**:
1. Check build logs in terminal
2. Verify project has files synced to server
3. Check Handlebars syntax in templates
4. Verify disk permissions:
   ```bash
   ls -la public/
   chmod 755 public/
   ```
5. Check available disk space:
   ```bash
   df -h
   ```

### Custom Domain Not Working

**Symptoms**: Domain doesn't load site

**Solutions**:
1. Verify DNS is configured correctly:
   ```bash
   dig sweetcandies.com
   nslookup sweetcandies.com
   ```
2. Wait for DNS propagation (up to 48 hours)
3. Check reverse proxy configuration:
   ```bash
   # Nginx
   sudo nginx -t
   sudo systemctl status nginx

   # Check logs
   sudo tail -f /var/log/nginx/error.log
   ```
4. Verify SSL certificate:
   ```bash
   sudo certbot certificates
   ```
5. Test direct access to OSW site path:
   ```
   https://your-osw-instance.com/sites/{siteId}/
   ```
6. Hard refresh browser (Ctrl+Shift+R)
7. Clear browser cache

### Authentication Issues

**Symptoms**: Can't login to /admin

**Solutions**:
1. Verify `ADMIN_PASSWORD` is set in .env
2. Try resetting password:
   ```bash
   # Update .env
   ADMIN_PASSWORD=new_password_here

   # Restart server
   pm2 restart osw-studio  # or npm run dev
   ```
3. Clear browser cookies
4. Try incognito mode
5. Check `SESSION_SECRET` is set

### Performance Issues

**Symptoms**: Slow site loads, high memory

**Solutions**:
1. Optimize published sites:
   - Compress images
   - Minify CSS/JS
   - Use CDN for libraries
2. Monitor server resources:
   ```bash
   htop  # or top
   df -h  # disk space
   free -m  # memory
   ```
3. Scale server resources (RAM/CPU)
4. Add caching (Nginx cache)

### Site Not Updating After Republish

**Symptoms**: Changes not showing on published site

**Solutions**:
1. Hard refresh browser (Ctrl+Shift+R)
2. Check `settingsVersion` vs `lastPublishedVersion` in site card
3. Verify "Publish" was clicked (not just "Save")
4. Check build succeeded in terminal logs
5. Inspect HTML source for changes
6. Clear CDN cache (if using one)

---

## Next Steps

- **[FAQ](?doc=faq)** - Common Server Mode questions
- **[Deploying Sites](?doc=deploying-sites)** - Deploy user sites to Vercel/Netlify
- **[Troubleshooting](?doc=troubleshooting)** - Fix common issues
