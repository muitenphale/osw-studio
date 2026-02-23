# Deployment Publishing

Publish and configure deployments directly from OSW Studio in **Server Mode**.

---

## Overview

Server Mode lets you publish static sites directly from your OSW Studio instance. Each deployment gets its own URL, configurable settings for analytics, SEO, compliance, and more.

**Key Features:**
- **One-click publishing** - Compile and deploy instantly
- **Deployment settings** - Scripts, CDN resources, analytics
- **SEO optimization** - Meta tags, Open Graph, sitemaps
- **Compliance** - Cookie consent, GDPR/CCPA banners
- **Custom domains** - Use your own domain (advanced)

---

## Creating a Deployment

### From Projects View

1. Right-click on a project card
2. Select **"Create Deployment"**
3. Enter deployment name
4. Click **"Create Deployment"**

### From Deployments View

1. Click **"+ New Deployment"** button
2. Select source project
3. Enter deployment details
4. Click **"Create Deployment"**

---

## Publishing Workflow

1. Create/edit deployment settings
2. Click **"Save & Close"**
3. Click **"Publish Now"** (or right-click deployment → Publish)
4. Static builder runs:
   - Loads project files from server
   - Compiles Handlebars templates (partials from `/templates/`, context from `/data.json`)
   - Rewrites internal links to include `/deployments/{id}/` prefix
   - Injects configured settings (scripts, analytics, SEO)
   - Generates sitemap.xml and robots.txt
   - Writes to `/public/deployments/{id}/`
5. Site is live!

### Accessing Published Deployments

**Default URL:**
```
https://your-osw-instance.com/deployments/{id}/
```

**Clean URLs** (Next.js rewrites):
```
/deployments/{id}/about → /deployments/{id}/about.html
/deployments/{id}/blog/post → /deployments/{id}/blog/post.html
```

---

## Deployment Settings

Access deployment settings by clicking the gear icon on any deployment card, or right-click → Settings.

### General

- **Deployment name** - Display name for the deployment
- **URL slug** - Optional custom slug
- **Custom domain** - For advanced setups (see below)
- **Under construction** - Show maintenance page

### Scripts

Add custom scripts to your deployment's HTML:

**Head Scripts:**
- Analytics code
- Meta tag generators
- Preload hints

**Body Scripts:**
- Chat widgets
- Tracking pixels
- Third-party integrations

**Options:**
- Inline or external URL
- Async/defer loading
- Enable/disable per script

### CDN Resources

Load external CSS and JavaScript libraries:

- Bootstrap, Tailwind CDN
- Font Awesome, Material Icons
- jQuery, Alpine.js
- Google Fonts

**Configuration:**
- Resource URL
- Type (CSS or JS)
- Integrity hash (optional)
- Crossorigin setting

### Analytics

Track visitors with built-in or third-party analytics:

**Built-in Analytics** (privacy-focused):
- No cookies required
- Basic pageview tracking
- Referrer tracking
- Privacy mode option

**Third-party Providers:**
- Google Analytics 4
- Google Tag Manager
- Plausible
- Custom tracking code

**Enhanced Features** (toggleable):
- Heatmaps
- Session recording
- Performance metrics
- Engagement tracking
- Custom events

**Data Retention:**
- Configurable retention periods
- Pageviews: 90 days default
- Interactions: 30 days default
- Sessions: 60 days default

### SEO

Optimize your deployment for search engines:

**Meta Tags:**
- Title
- Description
- Keywords

**Open Graph:**
- OG Title
- OG Description
- OG Image

**Twitter Card:**
- Summary or Large Image

**Advanced:**
- Canonical URL
- noindex/nofollow options

**Auto-generated:**
- sitemap.xml
- robots.txt

### Compliance

GDPR/CCPA cookie consent and privacy compliance:

**Banner Settings:**
- Position: Top, Bottom, or Corner
- Style: Bar, Modal, or Corner popup
- Custom message text
- Accept/Decline button text

**Behavior:**
- Opt-in mode (block until consent)
- Opt-out mode (allow until decline)
- Block analytics until consent

**Policy Links:**
- Privacy policy URL
- Cookie policy URL

---

## Managing Deployments

### Deployment Actions

Right-click any deployment card for actions:

| Action | Description |
|--------|-------------|
| **View Live** | Open published site in new tab |
| **Settings** | Configure deployment options |
| **Republish** | Rebuild and deploy |
| **Copy Link** | Copy deployment URL to clipboard |
| **View Source** | Open source project |
| **Analytics** | View deployment analytics dashboard |
| **Capture Thumbnail** | Update preview image |
| **Unpublish** | Disable deployment (keeps settings) |
| **Delete** | Permanently remove deployment |

### Unpublish vs Delete

- **Unpublish**: Disables the deployment but preserves all settings. You can re-publish later.
- **Delete**: Permanently removes the deployment and all its settings.

### Version Tracking

Each deployment shows:
- **Settings Version**: Current configuration version
- **Published Version**: Last published version

If these differ, the deployment has unpublished changes.

---

## Custom Domains (Advanced)

Configure a custom domain for your published deployment.

### Overview

By default, deployments are available at:
```
https://your-osw-instance.com/deployments/{id}/
```

With a custom domain, visitors access your site at:
```
https://sweetcandies.com/
```

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
your-osw-instance.com/deployments/abc123/
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

    # Proxy to OSW Studio deployment
    location / {
        proxy_pass https://your-osw-instance.com/deployments/abc123/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rewrite location headers
        proxy_redirect https://your-osw-instance.com/deployments/abc123/ /;
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

#### 4. Configure in OSW Studio

1. Go to Deployments → Your Deployment → Settings
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
    # Rewrite all requests to deployment path
    rewrite * /deployments/abc123{uri}

    reverse_proxy your-osw-instance.com {
        header_up Host {upstream_hostport}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### What OSW Studio Does

- Stores custom domain in database
- Uses it for SEO meta tags
- Generates sitemap.xml with custom domain
- Updates canonical URLs

### What OSW Studio Doesn't Do

- DNS management
- Reverse proxy configuration
- SSL certificate generation
- Domain validation

---

## Troubleshooting

### Publishing Errors

**Symptoms**: Deployment not building, empty `/public/deployments/`

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

### Deployment Not Updating After Republish

**Symptoms**: Changes not showing on published site

**Solutions**:
1. Hard refresh browser (Ctrl+Shift+R)
2. Check `settingsVersion` vs `lastPublishedVersion` in deployment card
3. Verify "Publish" was clicked (not just "Save")
4. Check build succeeded in terminal logs
5. Inspect HTML source for changes
6. Clear CDN cache (if using one)

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
5. Test direct access to OSW deployment path:
   ```
   https://your-osw-instance.com/deployments/{id}/
   ```
6. Hard refresh browser (Ctrl+Shift+R)
7. Clear browser cache

---

## Next Steps

- **[Backend](?doc=backend-features)** - Database, edge functions, secrets
- **[Server Mode](?doc=server-mode)** - Setup and deployment
- **[Troubleshooting](?doc=troubleshooting)** - Fix common issues
