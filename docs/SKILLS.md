# Skills

**Teach AI your preferences and workflows.**

Skills are instruction documents that guide how AI builds your projects. Enable skills to make AI follow your preferred patterns, best practices, and coding styles automatically.

---

## What Are Skills?

Skills are markdown documents that teach the AI how you want things done:

- **Workflow guides** - Step-by-step processes to follow
- **Best practices** - Coding standards and patterns
- **Domain knowledge** - Specific expertise (e.g., accessibility)
- **Preferences** - Your personal coding style

**Think of skills as:**
- Training manuals for the AI
- Automated best practices
- Consistency enforcers
- Knowledge you don't have to repeat

**Skills are NOT:**
- Project templates (see [Templates](?doc=templates))
- Executable code
- Data storage
- Replacement for good prompts

---

## How Skills Work

When you enable a skill, OSW Studio makes it **available** to the AI, but doesn't load the entire content into context automatically. Instead:

1. **Metadata is revealed** - AI sees skill names, descriptions, and tags
2. **Dynamic loading** - Skills are loaded into project context only when needed
3. **Smart selection** - AI chooses to read a skill when it seems relevant to the task
4. **User control** - You can explicitly ask AI to use a specific skill

**Example**: Enable the "Accessibility" skill:
- AI sees "Accessibility skill available - WCAG guidelines and best practices"
- When you ask to build a form, AI recognizes accessibility is relevant
- AI reads the full skill content and applies the guidance:
  - Add proper ARIA labels
  - Ensure keyboard navigation
  - Include alt text for images
  - Follow accessibility best practices

This approach keeps the AI's context clean while making expertise available when needed.

### Skill Evaluation (Optional)

By default, the AI decides on its own whether to read a skill — but it doesn't always get it right. In practice, skills can be ignored even when they're clearly relevant, because the instruction to check skills is buried in a large system prompt.

**Skill Evaluation** solves this with a pre-flight check: before the main AI call, a quick non-streaming call evaluates your prompt against enabled skills. If any match, an explicit "read this skill" directive is injected into your message so the AI treats it as a high-priority instruction rather than an easily overlooked system prompt note.

**To enable:**
1. Go to **Skills** view
2. Toggle **Skill Evaluation** on (below the global skills toggle)

**What changes:**
- Each message triggers an additional API call using your selected model
- Matched skills appear as explicit read directives in the AI's input
- A `skill_evaluation` event appears in the debug panel showing what was evaluated

**Trade-off:** This adds an extra API call per message, increasing initial token usage. It's disabled by default — enable it if you find skills aren't being picked up consistently.

---

## Built-in Skills

OSW Studio includes skills to get you started:

### OSW Workflow

Teaches AI the recommended workflow for building in OSW Studio.

**What it does:**
- Plan before coding
- Build incrementally
- Test in preview
- Explain changes clearly

**When to use**: Always - this is the foundation

### Handlebars Advanced

Advanced Handlebars templating techniques.

**What it does:**
- Use Handlebars helpers
- Create reusable components
- Implement dynamic content
- Follow template best practices

**When to use**: When building Handlebars-based sites

### Accessibility

Web accessibility best practices (WCAG guidelines).

**What it does:**
- Add semantic HTML
- Include ARIA attributes
- Ensure keyboard navigation
- Provide alt text
- Use proper heading hierarchy

**When to use**: Always - accessibility should be standard

---

## Using Skills

### Enable a Skill

1. Click **Skills** in sidebar
2. Browse available skills
3. Click the toggle to enable a skill
4. Return to your project

The AI can now access this skill when it's relevant to your task. You can also explicitly ask the AI to use a specific skill (e.g., "Use the Accessibility skill to build this form").

### Disable a Skill

1. Go to **Skills** view
2. Find the enabled skill
3. Click the toggle to disable

The AI will no longer have access to that skill's content.

### Multiple Skills

Enable multiple skills at once. The AI can access any enabled skill when relevant to the task at hand.

**Recommendation**: Start with OSW Workflow + Accessibility as your baseline. The AI will intelligently choose which skills to reference based on what you're building.

---

## Creating Custom Skills

Teach AI your own preferred workflows and patterns.

### When to Create Skills

Create skills for:
- Company coding standards
- Personal workflow preferences
- Specific technologies you use
- Domain expertise (e.g., e-commerce patterns)
- Repeated instructions you give

### How to Create a Skill

1. **Write your skill**
   - Use markdown format
   - Be clear and specific
   - Include examples
   - Keep it focused on one topic

2. **Save as skill**
   - Go to **Skills** view
   - Click **Create Skill**
   - Paste your content
   - Add metadata (name, description, tags)
   - Save

3. **Use your skill**
   - Enable it like built-in skills
   - Test it on a project
   - Refine as needed

### Skill Writing Tips

**✅ Good skill content:**

Example of a well-written skill:

```
# Mobile-First Responsive Design

Always build mobile layouts first, then desktop.

## Process
1. Start with mobile viewport (375px)
2. Build layout that works on small screens
3. Add media queries for tablet (768px+)
4. Add media queries for desktop (1024px+)

## CSS Structure
- Use min-width media queries
- Avoid max-width
- Test on real devices

## Example CSS
/* Mobile first */
.container {
  padding: 1rem;
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
}
```

**❌ Avoid:**
- Vague instructions ("make it good")
- Too many topics in one skill
- Contradictory guidance
- Overly long documents (keep under 2 pages)

---

## Managing Skills

### Browse Skills

1. Click **Skills** in sidebar
2. View built-in and custom skills
3. Read descriptions
4. Enable/disable as needed

### Edit Custom Skills

1. Find your skill in Skills view
2. Click **Edit**
3. Make changes
4. Save

Built-in skills can't be edited.

### Delete Custom Skills

1. Find skill in Skills view
2. Click **Delete** (trash icon)
3. Confirm deletion

Built-in skills can't be deleted.

---

## Importing & Exporting Skills

### Export a Skill

Share your skills with others or back them up:

1. Go to **Skills** view
2. Find your skill
3. Click **Export** (download icon)
4. Save the skill file (`.md`)

### Import a Skill

Use skills created by others:

1. Click **Skills** in sidebar
2. Click **Import Skill**
3. Select skill file
4. Skill appears in your library

Skills are compatible with Anthropic's SKILL.md convention, so you can use skills from other sources.

---

## Skill Tips

**💡 Start with built-in skills**
Learn how skills work before creating your own

**💡 One skill per topic**
Don't try to teach everything in one skill

**💡 Be specific**
Vague guidance leads to unpredictable results

**💡 Include examples**
Show the AI exactly what you want

**💡 Test and refine**
Create a skill, test it, improve it based on results

**💡 Don't over-skill**
Too many skills can confuse the AI. Start with 2-3 essential ones.

---

## Skills vs Templates

**Skills** = Instructions for AI
- Markdown documents
- Teach AI how to work
- Apply to any project
- Reusable across all projects

**Templates** = Project starting points
- Complete file structures
- HTML, CSS, JavaScript
- One-time use per project

Use skills to improve how AI works. Use templates to start projects faster.

**[Learn about Templates →](?doc=templates)**

---

## Common Use Cases

### Company Standards

Create a skill with your company's:
- Code formatting rules
- File naming conventions
- Comment standards
- Framework preferences

### Personal Workflow

Teach AI your preferences:
- CSS methodology (BEM, Tailwind, CSS-in-JS)
- JavaScript style (ES6+ features you prefer)
- HTML structure patterns
- Testing requirements

### Technology-Specific

Create skills for:
- React best practices
- Vue patterns
- Specific CSS frameworks
- Animation libraries

### Domain Expertise

Share knowledge about:
- E-commerce best practices
- Blog structures
- Portfolio patterns
- SaaS landing pages

---

## Common Questions

**Q: How many skills should I enable?**
A: Start with 2-3 core skills. Add more as needed. Too many can be overwhelming.

**Q: Can skills conflict?**
A: Yes. If two skills give opposite guidance, AI may get confused. Keep skills complementary.

**Q: Do skills slow down AI?**
A: Minimal impact. Only skill metadata is always present. Full skill content is loaded on-demand, so you only pay for tokens when the skill is actually used. If you enable Skill Evaluation, there's an additional API call per message for the pre-flight check.

**Q: Can I use Anthropic's SKILL.md files?**
A: Yes! OSW Studio is compatible with the SKILL.md convention.

**Q: Should every team member have the same skills?**
A: For consistency, yes. Export/import skills to share with your team.

---

**Next Steps:**

- **[Working with AI](?doc=working-with-ai)** - Get better results
- **[Templates](?doc=templates)** - Start projects faster
- **[Projects](?doc=projects)** - Manage your work

---

**Ready to create your first skill?** Think about instructions you repeat often, and turn them into a reusable skill!
