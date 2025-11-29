# Getting Started with OSW Studio

**Create your first website in 5 minutes.**

This guide will walk you through setting up OSW Studio and building your first project.

---

## Step 1: Choose an AI Provider

OSW Studio needs an AI model to generate code. You have two options:

### Option A: Cloud Providers

Use a cloud AI service. You'll need an API key and will pay per usage (typically low cost).

| Provider | Get API Key |
|----------|-------------|
| **OpenRouter** | [Get Key](https://openrouter.ai/keys) |
| **OpenAI** | [Get Key](https://platform.openai.com/api-keys) |
| **Anthropic** | [Get Key](https://console.anthropic.com/settings/keys) |
| **Google** | [Get Key](https://aistudio.google.com/apikey) |
| **Groq** | [Get Key](https://console.groq.com/keys) |
| **SambaNova** | [Get Key](https://cloud.sambanova.ai/) |

**Note**: OSW Studio is developed using OpenRouter, so that provider has the most testing.

### Option B: Local AI (Free, No API Key)

Run AI models on your computer. Completely free but requires installation.

- **[Ollama](https://ollama.ai)** - Run open-source models locally via CLI
- **[LM Studio](https://lmstudio.ai)** - GUI for running local models

---

## Step 2: Configure Your Provider

You can configure your AI provider in two places:

**Option A: Global Settings**
1. Go to **Settings > Provider & Model**
2. Select your provider from the dropdown
3. Enter your API key (if using cloud provider)
4. Choose a model from the list

**Option B: In Workspace**
1. Open or create a project
2. Click the **model button** at the bottom left of the Chat panel
3. Select provider, add API key, and choose a model

Your selection persists automatically - no need to save. You can swap models anytime as part of normal usage.

**That's it!** You're ready to build.

---

## Step 3: Create Your First Project

Let's build a simple personal website.

### Start a New Project

1. Click **Projects** in the sidebar
2. Click **+ New Project**
3. Name your project (e.g., "My Portfolio")
4. Choose a template:
   - **Blank** - Minimal starting point (recommended for most projects)
   - **Example Studios** - Pre-built example to learn from

You'll see the workspace with 4 panels:
- **Chat** (left-most) - Talk to AI
- **File Explorer** (2nd) - Your project files
- **Code Editor** (3rd) - View and edit code
- **Preview** (last) - Live preview of your site

You can open and close panels from their headers and the sidebar on the workspace.

### Build With AI

In the chat, try this prompt:

```
Create a simple portfolio website with:
- A hero section with my name and title
- An about section
- A projects section
- A contact section
- Modern design with a blue color scheme
```

**Watch the AI work:**
- It will create HTML, CSS, and JavaScript files
- You'll see each file creation in the chat
- The preview updates in real-time
- You can ask it to make changes anytime

### Make Changes

Don't like something? Just ask:

```
Make the hero section taller and add a gradient background
```

```
Change the color scheme to purple and orange
```

```
Add smooth scrolling when clicking navigation links
```

The AI will update your code and explain what it changed.

---

## Step 4: Export Your Site

When you're happy with your website:

1. Click the **Menu** icon (three dots) in the top right
2. Select **Export**
3. Choose **ZIP** (suitable for hosting) or **JSON** (for backup)
4. Download the file

You now have a complete, ready-to-deploy website!

---

## Step 5: Deploy to the Web

Upload your site to make it live. Here are the easiest options:

### Vercel (Recommended)

1. Go to [vercel.com](https://vercel.com)
2. Sign up (free)
3. Drag and drop your ZIP file
4. Get a live URL instantly

### Netlify

1. Go to [netlify.com](https://netlify.com)
2. Sign up (free)
3. Drag and drop your ZIP file
4. Get a live URL instantly

Both services offer:
- Free hosting
- Automatic HTTPS
- Custom domains (optional)
- Instant deploys

**[Detailed deployment guide →](?doc=deploying-sites)**

---

## What's Next?

**Get better results from AI:**
- [Working with AI](?doc=working-with-ai) - Prompting tips and best practices

**Speed up your workflow:**
- [Templates](?doc=templates) - Start projects faster
- [Skills](?doc=skills) - Teach AI your preferences

**Manage your work:**
- [Projects](?doc=projects) - Save, organize, and export projects

**Advanced features:**
- [Server Mode](?doc=server-mode) - Self-host with PostgreSQL and publish sites directly

**Need help?**
- [FAQ](?doc=faq) - Common questions
- [Troubleshooting](?doc=troubleshooting) - Fix issues

---

## Quick Tips

**💡 Be Specific**
Instead of "make it look good", try "add a gradient from blue to purple in the hero section"

**💡 Make One Change at a Time**
Breaking requests into smaller steps gives better results

**💡 Save Often**
Projects auto-save, but you can manually save with Ctrl+S (Cmd+S on Mac)

**💡 Use Templates**
Starting from a template is faster than building from scratch

**💡 Start Simple**
Get the basic structure working, then add features one by one

---

**Ready to build?** Head back to Projects and start creating!
