import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const GUIDED_CHAT_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Guided Chat',
  description: 'A chat widget that answers with pre-set replies and buttons, needs no backend and embeds into an existing site',
  directories: ['/styles', '/scripts'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guided Chat</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <div class="demo" role="region" aria-label="Guided chat">
        <header class="chat-head">
            <div>
                <h1 id="chat-title">Guided Chat</h1>
                <p id="chat-subtitle" class="chat-subtitle"></p>
            </div>
            <button type="button" id="restart" class="filter">Start again</button>
        </header>

        <div class="chat" id="transcript" aria-live="polite"></div>

        <div class="choices" id="choices"></div>
    </div>

    <script src="/scripts/chat.js"></script>
</body>
</html>`,
    },
    {
      path: '/flow.json',
      content: `{
  "title": "Harbour Lane Joinery",
  "subtitle": "A few questions to point you the right way.",
  "start": "welcome",
  "steps": {
    "welcome": {
      "say": "Hello. I can tell you about our work, what things cost, and how to get a quote. What are you after?",
      "choices": [
        { "label": "I want something made", "next": "what-kind" },
        { "label": "How much does it cost?", "next": "pricing" },
        { "label": "Where are you?", "next": "visit" },
        { "label": "Something else", "next": "human" }
      ]
    },
    "what-kind": {
      "say": "What sort of piece is it?",
      "choices": [
        { "label": "Fitted wardrobe", "next": "wardrobe" },
        { "label": "Kitchen", "next": "kitchen" },
        { "label": "Shelving or a repair", "next": "small-job" },
        { "label": "Back", "next": "welcome" }
      ]
    },
    "wardrobe": {
      "say": "Fitted wardrobes start around £1,800 and take six to eight weeks from deposit. We measure the room ourselves, because alcoves are rarely square and the price depends on it.",
      "choices": [
        { "label": "Book a measuring visit", "next": "quote" },
        { "label": "What about a kitchen?", "next": "kitchen" },
        { "label": "Back to the start", "next": "welcome" }
      ]
    },
    "kitchen": {
      "say": "Kitchens start around £6,000 for carcasses, doors and worktop. We can fit it or work alongside your own fitter. Lead time is usually eight weeks.",
      "choices": [
        { "label": "Book a measuring visit", "next": "quote" },
        { "label": "What about a wardrobe?", "next": "wardrobe" },
        { "label": "Back to the start", "next": "welcome" }
      ]
    },
    "small-job": {
      "say": "Shelving and repairs start around £250. Sash windows and doors that have stopped closing are common ones, and we can usually look within a fortnight.",
      "choices": [
        { "label": "Get in touch", "next": "quote" },
        { "label": "Back to the start", "next": "welcome" }
      ]
    },
    "pricing": {
      "say": "Everything is quoted after we have seen the room, and the visit is free. As a rough guide: repairs from £250, wardrobes from £1,800, kitchens from £6,000. A deposit of 30% books the workshop time and the rest is due on completion.",
      "choices": [
        { "label": "Book a measuring visit", "next": "quote" },
        { "label": "Back to the start", "next": "welcome" }
      ]
    },
    "visit": {
      "say": "We are at Unit 4, Harbour Lane, Bristol BS1 4TR. Open Monday to Thursday 8am to 5pm, Friday until 3pm, and Saturday by appointment. There is parking on the lane.",
      "choices": [
        { "label": "Book a measuring visit", "next": "quote" },
        { "label": "Back to the start", "next": "welcome" }
      ]
    },
    "quote": {
      "say": "The quickest way is email with the room, roughly what you have in mind, and when you would like it done. We reply within two working days.",
      "link": { "label": "hello@harbourlanejoinery.example", "href": "mailto:hello@harbourlanejoinery.example" },
      "choices": [
        { "label": "Back to the start", "next": "welcome" }
      ]
    },
    "human": {
      "say": "Fair enough, I only know the things above. Email or ring and a person will answer.",
      "link": { "label": "hello@harbourlanejoinery.example", "href": "mailto:hello@harbourlanejoinery.example" },
      "choices": [
        { "label": "Back to the start", "next": "welcome" }
      ]
    }
  }
}`,
    },
    {
      path: '/scripts/chat.js',
      content: `/*
 * Walks the visitor through flow.json. Every reply is written in advance and every
 * answer is a button, so there is no model, no key and no backend involved.
 *
 * Nothing is stored. Reloading the page starts the conversation again, which is the
 * honest behaviour for a widget that never sends anything anywhere.
 */

(function () {
  var flow = null;

  // Root-relative resolves in the preview, relative on a published deployment under
  // /deployments/{id}/. Trying both keeps one file working in both places.
  function loadJSON(path) {
    var candidates = ['/' + path.replace(/^\\//, ''), path.replace(/^\\//, '')];
    var i = 0;
    function next() {
      if (i >= candidates.length) return Promise.reject(new Error('Could not load ' + path));
      return fetch(candidates[i++]).then(function (res) {
        return res.ok ? res.json() : next();
      }, next);
    }
    return next();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function scrollToEnd() {
    var transcript = document.getElementById('transcript');
    transcript.scrollTop = transcript.scrollHeight;
  }

  function addBubble(who, text) {
    var bubble = el('div', 'bubble bubble-' + who, text);
    document.getElementById('transcript').appendChild(bubble);
    scrollToEnd();
    return bubble;
  }

  function showStep(id) {
    var step = flow.steps[id];
    var choicesBox = document.getElementById('choices');
    choicesBox.innerHTML = '';

    if (!step) {
      addBubble('bot', 'That question leads nowhere yet. Start again, or ask a person.');
      return;
    }

    addBubble('bot', step.say);

    if (step.link) {
      var wrap = el('div', 'bubble bubble-bot bubble-link');
      var link = el('a', null, step.link.label);
      link.href = step.link.href;
      wrap.appendChild(link);
      document.getElementById('transcript').appendChild(wrap);
      scrollToEnd();
    }

    (step.choices || []).forEach(function (choice) {
      var button = el('button', 'filter', choice.label);
      button.type = 'button';
      button.addEventListener('click', function () {
        addBubble('you', choice.label);
        choicesBox.innerHTML = '';
        showStep(choice.next);
      });
      choicesBox.appendChild(button);
    });
  }

  function start() {
    document.getElementById('transcript').innerHTML = '';
    showStep(flow.start);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('restart').addEventListener('click', function () {
      if (flow) start();
    });

    loadJSON('flow.json').then(
      function (data) {
        flow = data;
        document.getElementById('chat-title').textContent = data.title || 'Guided Chat';
        document.getElementById('chat-subtitle').textContent = data.subtitle || '';
        document.title = data.title || 'Guided Chat';
        start();
      },
      function () {
        document.getElementById('transcript').innerHTML =
          '<div class="bubble bubble-bot">flow.json could not be loaded. It should sit at the root of the project.</div>';
      }
    );
  });
})();`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 285, chroma: 0.19, lightness: 0.56 })}

/* The widget frame. Everything above is the shared component CSS; this is the
   box it lives in, which is usually an iframe of about 380 by 560 in the corner
   of somebody else's page. */
.demo {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 30rem;
  margin: 0 auto;
}

.chat-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1.25rem;
  border-bottom: 1px solid var(--line);
}

.chat-head h1 {
  font-size: 1rem;
  letter-spacing: -0.01em;
}

.chat-subtitle {
  font-size: 0.8125rem;
  color: var(--ink-soft);
  margin-top: 0.15rem;
}

/* The restart control sits in a narrow header, where the shared pill would
   otherwise wrap onto two lines. */
.chat-head .filter {
  white-space: nowrap;
  flex-shrink: 0;
}

.chat {
  flex: 1;
  overflow-y: auto;
}

.bubble-link a {
  color: var(--accent-text);
  word-break: break-word;
}

/* In the iframe it is meant for, the frame only wastes pixels. */
@media (max-width: 30rem) {
  .demo {
    border: 0;
    border-radius: 0;
  }
}`,
    },
    {
      path: '/.PROMPT.md',
      content: `${STATIC_DOMAIN_PROMPT}

---

# This project: a guided chat widget

A chat where every reply is written in advance and every answer the visitor gives is a button. It
looks like a chatbot and behaves like a decision tree, which is why it needs no model, no API key
and no server.

The seed flow is a joinery workshop answering the questions such a business actually gets. Replace
it with the user's own.

## Where things are

- \`/flow.json\`: the entire conversation. This is the only file that changes when the script does.
- \`/scripts/chat.js\`: walks the flow and draws the bubbles.
- \`/styles/style.css\`, \`/index.html\`: the widget. The accent is hue 285, and the only thing it
  fills is the visitor's own side of the transcript.

## It is a widget, not a page

Sized and spaced to be dropped into an iframe in the corner of somebody else's site, around 380 by
560, and it fills whatever box it is given. Judge any change at that size rather than at full
screen: type that reads well across a page is too loose in a 380px column.

Bubbles belong here because this really is a conversation and the turns are short. The AI Assistant
template is the page-shaped one, and it deliberately does not use them.

## The shape of flow.json

\`\`\`json
{
  "title": "Shown in the header",
  "subtitle": "One line under it",
  "start": "welcome",
  "steps": {
    "welcome": {
      "say": "What the bot says at this step.",
      "link": { "label": "optional link text", "href": "mailto:..." },
      "choices": [ { "label": "What the visitor clicks", "next": "another-step-id" } ]
    }
  }
}
\`\`\`

Every \`next\` must name a key in \`steps\`. A dead link shows an apology instead of the step, so check
them after editing: it is the one way to break this file.

## Writing a good flow

- **Answer at the step, do not defer.** "Wardrobes start around £1,800 and take six to eight weeks"
  is the point of the widget. "Please contact us for pricing" wastes the visitor's click.
- **Always offer a way out.** Every step should reach either an answer with a real contact link or a
  route back to the start. A visitor who reaches a step with one irrelevant button leaves.
- **Keep it three or four deep.** Past that people give up. If a topic needs more, answer it in one
  step and hand off to email.
- **Say when you do not know.** The \`human\` step exists so the widget can admit its limits rather
  than guessing, and every flow should have one.
- Four choices per step is about the maximum before the buttons wrap into a wall.

## Nothing is stored

There is no transcript, no analytics and no submission anywhere. Reloading starts over. If the user
wants to capture what people asked, that needs Server Mode: an edge function writing to a database,
which also means telling visitors it is being recorded.

## Embedding this in another site

It is a whole page, so use an iframe:

\`\`\`html
<iframe src="https://your-deployment-url/" width="380" height="560" style="border:0"
        title="Chat"></iframe>
\`\`\`

Nothing in the project needs changing for that. Note the widget fills whatever box it is given, so
the size is decided by the iframe.

${TEMPLATE_STYLE_PROMPT}
`,
    },
  ],
};
