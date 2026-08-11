import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const PORTFOLIO_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Portfolio & CV',
  description: 'One page about one person: selected work, a short bio, work history and how to reach you',
  directories: ['/styles', '/scripts'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nadia Okonjo, product designer</title>
    <meta name="description" content="Product designer working on tools for small teams. Currently at Fieldnote. Previously Ordnance, Bellwether.">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <a class="skip-link" href="#work">Skip to work</a>

    <div class="head-band">
        <header class="wrap site-head">
            <a class="brand" href="#top">Nadia <em>Okonjo</em></a>
            <nav class="site-nav">
                <a href="#work">Work</a>
                <a href="#about">About</a>
                <a href="#cv">History</a>
                <a class="btn btn-line btn-sm" href="mailto:nadia@example.com">Email me</a>
            </nav>
        </header>
    </div>

    <main id="top">
        <section class="hero">
            <div class="wrap">
                <p class="label">Product designer &middot; Lisbon</p>
                <h1>I design the unglamorous parts of software</h1>
                <p class="lede">Settings, permissions, and the screen you see when something has gone wrong. Currently at Fieldnote, before that Ordnance and Bellwether.</p>
                <div class="row-set">
                    <a class="btn btn-primary" href="mailto:nadia@example.com">Email me</a>
                    <a class="btn btn-quiet" href="#work">See the work</a>
                </div>
            </div>
        </section>

        <!--
          Three pieces of work, each with what changed as a result. Cards rather
          than a rail of years: the year is the least interesting thing about an
          entry, so it sits under the outcome rather than setting the layout.
        -->
        <section class="band" id="work">
            <div class="wrap">
                <h2>Selected work</h2>
                <div class="cards">
                    <div class="card">
                        <h3>Fieldnote, permissions rebuild</h3>
                        <p>The old model had four sharing states nobody could tell apart. The new one has two, and support tickets about access dropped by roughly half in the quarter after launch.</p>
                        <p class="from mono">2025 &middot; Research, IxD, design system</p>
                    </div>
                    <div class="card">
                        <h3>Ordnance, survey tooling</h3>
                        <p>An offline-first form builder for surveyors working with no signal. Most of the work was deciding what to do when two people edited the same record a day apart.</p>
                        <p class="from mono">2023 &middot; Product design, prototyping</p>
                    </div>
                    <div class="card">
                        <h3>Bellwether, onboarding</h3>
                        <p>Cut first-run setup from eleven screens to three by moving the rest into defaults that could be changed later. Activation went up and nobody missed the questions.</p>
                        <p class="from mono">2021 &middot; Product design</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="band band-sunken" id="about">
            <div class="wrap">
                <h2>About</h2>
                <div class="read">
                    <p>I started in print and moved into software in 2016, which is why I care more about hierarchy and spacing than most people think is reasonable. I like problems where the answer is to remove something.</p>
                    <p>Outside work I repair bicycles badly and read a lot of maritime history.</p>
                </div>
            </div>
        </section>

        <section class="band" id="cv">
            <div class="wrap">
                <h2>Work history</h2>
                <div class="list">
                    <div class="list-item">
                        <div>
                            <div class="lead">Senior product designer</div>
                            <div class="sub">Fieldnote</div>
                        </div>
                        <span class="tag">2024&ndash;</span>
                    </div>
                    <div class="list-item">
                        <div>
                            <div class="lead">Product designer</div>
                            <div class="sub">Ordnance</div>
                        </div>
                        <span class="tag">2022&ndash;24</span>
                    </div>
                    <div class="list-item">
                        <div>
                            <div class="lead">Product designer</div>
                            <div class="sub">Bellwether</div>
                        </div>
                        <span class="tag">2019&ndash;22</span>
                    </div>
                    <div class="list-item">
                        <div>
                            <div class="lead">Designer</div>
                            <div class="sub">Marchmont Press</div>
                        </div>
                        <span class="tag">2016&ndash;19</span>
                    </div>
                </div>
            </div>
        </section>

        <section class="band band-sunken" id="contact">
            <div class="wrap split">
                <div>
                    <h2>Get in touch</h2>
                    <p class="muted">I take on a small amount of freelance work each year, usually design systems or a stubborn flow that needs untangling. The fastest way to reach me is email.</p>
                </div>
                <div class="row-set">
                    <a class="btn btn-primary" href="mailto:nadia@example.com">nadia@example.com</a>
                    <a class="btn btn-quiet" href="https://github.com/example" rel="me">GitHub</a>
                </div>
            </div>
        </section>
    </main>

    <div class="foot-band">
        <footer class="wrap site-foot">
            <span>Nadia Okonjo, product designer, Lisbon</span>
            <span class="mono"><span id="year">2025</span> &middot; Built with OSW Studio</span>
        </footer>
    </div>

    <script src="/scripts/main.js"></script>
</body>
</html>`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 210, chroma: 0.14, lightness: 0.53 })}

/* Everything above is the shared theme, and the accent hue is the only thing
   this page chose. What follows is what a full-width page needs and a component
   set has no rule for: the skip link, and the bands the sections sit in. */

/* The same gutter .wrap uses, so a band can line its own padding up with it. */
:root {
  --gutter: clamp(1.25rem, 4vw, 2.5rem);
}

html {
  scroll-behavior: smooth;
}

.skip-link {
  position: absolute;
  left: -9999px;
  background: var(--ink);
  color: var(--canvas);
  border-radius: var(--r-sm);
  padding: 0.75rem 1rem;
  z-index: 200;
}

.skip-link:focus {
  left: 1rem;
  top: 1rem;
}

/* The shared header, hero and footer were drawn inside a card, where the card's
   edge was the gutter. On a full page the band runs edge to edge and the .wrap
   inside it sets the measure, so the band takes the keyline and the component
   keeps only its height. */
.head-band {
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}

.foot-band {
  border-top: 1px solid var(--line);
}

.wrap.site-head {
  padding: 0.85rem var(--gutter);
  border-bottom: 0;
}

.wrap.site-foot {
  padding: 1.25rem var(--gutter);
  border-top: 0;
}

.hero {
  padding-left: 0;
  padding-right: 0;
}

.band .wrap,
.hero .wrap {
  padding-top: 0;
  padding-bottom: 0;
}

/* .site-nav paints every link inside itself, and it out-specifies .btn-line. */
.site-nav a.btn-line {
  color: var(--canvas);
}

.hero h1 {
  margin-top: 0.75rem;
}

.band {
  padding: clamp(3rem, 6vw, 4.5rem) 0;
  border-bottom: 1px solid var(--line);
}

.band-sunken {
  background: var(--base);
}

.band h2 {
  margin-bottom: 1.5rem;
}

.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}

@media (max-width: 640px) {
  /* Flex items shrink below their content by default, so without the nowrap the
     links break mid-label instead of the row breaking between them. */
  .wrap.site-head {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .site-nav {
    width: 100%;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
  }

  .site-nav a {
    font-size: 0.8125rem;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}`,
    },
    {
      path: '/scripts/main.js',
      content: `// The page is one column of HTML that a browser renders without help. This only
// fills in the year in the footer, and if it never runs the page is still
// complete.

document.addEventListener('DOMContentLoaded', function () {
  var year = document.getElementById('year');
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
});`,
    },
    {
      path: '/.PROMPT.md',
      content: `${STATIC_DOMAIN_PROMPT}

---

# This project: one person's portfolio and CV

A single page about one person, filled in as a product designer called Nadia Okonjo so that it reads
as a finished site rather than a wireframe. **Every name, job and project in it is invented.** The
first job is nearly always replacing all of it with the real person.

## Where things are

- \`/index.html\`: all the content. No data file, no template engine, so the text is in the HTML.
- \`/styles/style.css\`: the shared template theme, then a short tail of page-level rules. The theme
  is generated, so the only thing to change up there is the accent hue, currently 210. Everything
  after it is the skip link and the bands the sections sit in.
- \`/scripts/main.js\`: the footer year, nothing else.

## Filling it in

Ask for what you do not have rather than inventing it. A portfolio with made-up employers is worse
than an empty one. In order:

1. \`<title>\` and the meta description, which are what a recruiter sees in a search result
2. The name in the header, and the hero heading, label and lede
3. The three work cards, newest first
4. The about paragraphs
5. The work history rows
6. The contact section, and the email in both the header and the hero

## Writing the work entries

This is the part that matters, and the placeholder cards show the shape to copy: **what the thing
was, what was actually decided or changed, and what happened as a result.** "The old model had four
sharing states nobody could tell apart, the new one has two, and tickets dropped by half" is a
portfolio entry. "Responsible for UX across the platform" is a job description.

- Prefer a concrete number when there is a real one. Do not manufacture one.
- One card per piece of work, three to five in total. A portfolio is a selection, not an archive.
- If the user cannot say what changed, that is worth asking about rather than padding with adjectives.

## Conventions this project follows

- **One accent colour, spent about once per screen.** The design does its work through type size and
  space, so the accent is the hero button and little else.
- **No skill bars, no percentages, no logo walls.** Nobody is 87% proficient in anything.
- **The page is light, and stays light.** Adding a dark variant means a second palette to keep in
  step; adding a toggle also means storing a preference. Neither is worth it for one page.

${TEMPLATE_STYLE_PROMPT}

## Adding a case study page

If a piece of work deserves more than a paragraph, add a separate \`.html\` file that reuses the same
stylesheet, and link the card title to it. Wrap the prose in \`.read\`, which is the shared reading
column, and keep the same header and footer so the two pages look like one site.
`,
    },
  ],
};
