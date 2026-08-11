import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const BUSINESS_WEBSITE_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Business Website',
  description: 'One-page site for a local business: what you do, prices, opening hours, where to find you and how to get in touch',
  directories: ['/styles', '/scripts', '/assets', '/assets/images'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Harbour Lane Joinery, fitted furniture in Bristol</title>
    <meta name="description" content="A two-person joinery workshop on Harbour Lane, Bristol. Fitted wardrobes from £1,800, kitchens from £6,000. Free measuring visit and written quote.">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <a class="skip-link" href="#work">Skip to what we make</a>

    <div class="head-band">
        <header class="wrap site-head">
            <a class="brand" href="#top">Harbour Lane <em>Joinery</em></a>
            <nav class="site-nav">
                <a href="#work">What we make</a>
                <a href="#how">How a job runs</a>
                <a href="#visit">Visit</a>
                <a class="btn btn-line btn-sm" href="#quote">Get a quote</a>
            </nav>
        </header>
    </div>

    <main id="top">
        <section class="hero">
            <div class="wrap">
                <p class="label">Bristol &middot; Est. 2009</p>
                <h1>Fitted furniture, made two streets away</h1>
                <p class="lede">We measure your room, make the piece here, and fit it ourselves. No subcontractors, no flat packs.</p>
                <div class="row-set">
                    <a class="btn btn-primary" href="#quote">Get a quote</a>
                    <a class="btn btn-quiet" href="#work">See what we make</a>
                </div>
            </div>
        </section>

        <div class="showcase">
            <img src="/assets/images/work.jpg" alt="" width="1600" height="900">
        </div>

        <section class="band" id="work">
            <div class="wrap">
                <h2>What we make</h2>
                <div class="cards">
                    <div class="card">
                        <h3>Fitted wardrobes</h3>
                        <p>Built to the exact height of your room, including the awkward corners under a staircase or into a chimney breast.</p>
                        <p class="from mono">From &pound;1,800</p>
                    </div>
                    <div class="card">
                        <h3>Kitchens</h3>
                        <p>Solid oak or painted birch ply, with the doors and worktop of your choice. We can work alongside your own fitter.</p>
                        <p class="from mono">From &pound;6,000</p>
                    </div>
                    <div class="card">
                        <h3>Shelving and repairs</h3>
                        <p>Alcove bookcases, window seats, and sash windows put right.</p>
                        <p class="from mono">From &pound;250</p>
                    </div>
                </div>
                <p class="muted note">Every job is quoted after we have seen the room, because a wardrobe on a level wall and a wardrobe in a Victorian bedroom are not the same job.</p>
            </div>
        </section>

        <!--
          An ordered list, and the numbers come from a CSS counter: these steps
          really are a sequence. The cards above are a catalogue, so they are not
          numbered.
        -->
        <section class="band band-sunken" id="how">
            <div class="wrap">
                <h2>How a job runs</h2>
                <ol class="steps">
                    <li>
                        <h3>Measuring visit</h3>
                        <p>Free, and usually within a week of you getting in touch.</p>
                    </li>
                    <li>
                        <h3>Written quote</h3>
                        <p>Within three working days of the visit. No obligation either way.</p>
                    </li>
                    <li>
                        <h3>Deposit</h3>
                        <p>30% books the workshop time. The rest is due on completion.</p>
                    </li>
                    <li>
                        <h3>Fitting</h3>
                        <p>Six to eight weeks from the deposit for most jobs, and we fit it ourselves.</p>
                    </li>
                </ol>
            </div>
        </section>

        <section class="band" id="visit">
            <div class="wrap split">
                <div>
                    <h2>Opening hours</h2>
                    <div class="table-scroll">
                        <table>
                            <tbody>
                                <tr><th scope="row">Monday to Thursday</th><td class="num">8am &ndash; 5pm</td></tr>
                                <tr><th scope="row">Friday</th><td class="num">8am &ndash; 3pm</td></tr>
                                <tr><th scope="row">Saturday</th><td class="num">By appointment</td></tr>
                                <tr><th scope="row">Sunday</th><td class="num">Closed</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div>
                    <h2>Finding us</h2>
                    <address>
                        Unit 4, Harbour Lane<br>
                        Bristol BS1 4TR
                    </address>
                    <p class="muted">Drop in during opening hours to see work in progress. There is parking on the lane itself, and the entrance is the blue door at the far end.</p>
                </div>
            </div>
        </section>

        <section class="band band-sunken" id="quote">
            <div class="wrap split">
                <div>
                    <h2>Get a quote</h2>
                    <p class="muted">Tell us the room, roughly what you have in mind, and when you would like it done. We reply to everything within two working days.</p>
                </div>
                <div class="row-set">
                    <a class="btn btn-primary" href="mailto:hello@harbourlanejoinery.example">Email us</a>
                    <a class="btn btn-quiet" href="tel:+441170000000">0117 000 0000</a>
                </div>
            </div>
        </section>
    </main>

    <div class="foot-band">
        <footer class="wrap site-foot">
            <span>Harbour Lane Joinery, Bristol. Company no. 00000000.</span>
            <span class="mono"><span id="year">2025</span> &middot; Built with OSW Studio</span>
        </footer>
    </div>

    <script src="/scripts/main.js"></script>
</body>
</html>`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 32 })}

/* Everything above is the shared theme, and the accent hue is the only thing this
   site chose. What follows is the handful of things a full page needs that a
   component set has no rule for: the skip link, the bands the sections sit in,
   and the numbered steps. */

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
   keeps only its height. Without this the header sits hard against the window
   while everything below it is centred, and the two read as different pages. */
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

/* The shared .wrap carries the page's own top and bottom padding. Inside a band
   the band supplies that, so here it only has to hold the measure. */
.band .wrap,
.hero .wrap {
  padding-top: 0;
  padding-bottom: 0;
}

/* .site-nav paints every link inside itself, and it out-specifies .btn-line.
   The artifact's nav used a <button>; this one is a real link to #quote. */
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

.note {
  margin-top: 1.5rem;
  font-size: 0.9375rem;
}

/* A band of imagery between the hero and the work, full bleed so it reads as a
   break in the page rather than as a card. */
.showcase {
  border-bottom: 1px solid var(--line);
}

.showcase img {
  display: block;
  width: 100%;
  height: clamp(11rem, 26vw, 19rem);
  object-fit: cover;
}

.steps {
  list-style: none;
  counter-reset: step;
  display: grid;
  gap: 1.75rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  margin: 0;
  padding: 0;
}

.steps li {
  counter-increment: step;
  padding-top: 1rem;
  border-top: 2px solid var(--line-strong);
}

.steps li::before {
  content: counter(step, decimal-leading-zero);
  display: block;
  margin-bottom: 0.6rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--accent-text);
}

.steps p {
  margin-top: 0.35rem;
  font-size: 0.9375rem;
  color: var(--ink-soft);
}

.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}

#visit table {
  min-width: 0;
}

#visit th {
  font-family: var(--sans);
  font-size: 0.9375rem;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink);
  font-weight: 400;
  padding-left: 0;
}

#visit td {
  padding-right: 0;
  color: var(--ink-soft);
}

address {
  font-style: normal;
  margin-bottom: 1rem;
}

/* On a phone the nav has no room beside the name, and a flex row with nowhere to
   go breaks every label onto three lines. Give it the next row instead, where
   the three section links and the call to action fit across in one. */
@media (max-width: 640px) {
  .wrap.site-head {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  /* Flex items shrink below their content by default, so without the nowrap the
     links break mid-label instead of the row breaking between them. */
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

# This project: a one-page business website

A single page for one local business, currently filled in as a joinery workshop in Bristol so that
it looks like a real site rather than a wireframe. **All of that content is placeholder.** The first
job on this project is almost always replacing it with the real business.

## Where things are

- \`/index.html\`: every word on the site. There is no data file and no template engine, so the text
  lives in the HTML, which is what makes the page render instantly and read correctly to search
  engines.
- \`/styles/style.css\`: the shared template theme, then a short tail of page-level rules. The theme
  is generated, so the only thing to change up there is the accent hue, currently 32. Everything
  after it is the skip link, the bands, the numbered steps and the hours table.
- \`/scripts/main.js\`: the footer year, and nothing else. The page is complete without it.

## How this page is put together

It is a one-page site, in the order someone reads it: who they are, what they make, how a job runs,
where to find them, how to get in touch.

- **The header carries the name and the one action.** "Get a quote" is the neutral button in the
  header and the accent button in the hero; the rest of the nav is plain links to the sections.
- **The work is three cards**, each with the price underneath in the mono face. If the business has
  more than about six things to sell, that is the point at which a list of rows reads better than a
  grid of cards.
- **"How a job runs" is an ordered list** and its numbers come from a CSS counter, because those
  steps really are a sequence. The cards above are a catalogue, so they are not numbered. Keep that
  distinction; numbering things that are not sequences is decoration.
- **The image band is an abstract placeholder**, not a photograph of anything. Swap it for the
  business's own photo when there is one, or delete the \`.showcase\` block. Stock photography of a
  workshop, kitchen or salon is somebody else's premises and it shows.

## Changing the business

When asked to turn this into a different kind of business, change all of it and be thorough:

1. \`<title>\` and the meta description
2. The name in the header and the footer company line
3. The hero heading and lede, which say what they do and how they work
4. The three cards, which become services, treatments, dishes, practice areas
5. The steps under "How a job runs", which should describe how that trade actually works
6. The hours table and the address
7. The contact email and phone
8. The accent hue, if the trade has a colour of its own

## Conventions this project follows

- **Say what things cost, or say how they are priced.** The placeholder content commits to real
  numbers because a business site that dodges price is a worse site. If the trade cannot quote up
  front, describe the quoting process instead, which is what "How a job runs" does now.
- **Write in the business's own voice, first person plural.** "We measure your room" beats
  "Bespoke solutions tailored to your needs".
- **One page until there is a reason.** Extra pages are cheap to add later; a business with three
  services does not need five pages. If a page is added, link it from the header nav.

${TEMPLATE_STYLE_PROMPT}

## What this project cannot do on its own

The contact section hands off to email and phone. A form that **stores** what visitors send needs
Server Mode, where it becomes an edge function writing to a database. In Browser mode there is
nowhere for a submission to go. Say so plainly rather than adding a form that silently discards
what people type.
`,
    },
  ],
  assets: [{ filename: 'example-background.jpg', path: '/assets/images/work.jpg' }],
};
