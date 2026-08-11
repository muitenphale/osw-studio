import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const AI_ASSISTANT_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'AI Assistant',
  description: 'A chat page backed by a server function that holds your API key, so the key never reaches the browser (needs Server Mode)',
  directories: ['/styles', '/scripts'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ask the assistant</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <!--
      The same chat component the Guided Chat template uses. The theme spec
      shows one pattern for both, labelled "Chat, Guided Chat and AI Assistant".
      What differs between them is where the replies come from, not the markup.
    -->
    <div class="demo" role="region" aria-label="Assistant">
        <header class="chat-head">
            <div>
                <h1>Ask the assistant</h1>
                <p class="chat-subtitle">Answers come from the OpenAI API, model <code>gpt-5-nano-2025-08-07</code>. Check anything that matters.</p>
            </div>
            <span class="tag" id="mode" hidden></span>
        </header>

        <div class="chat" id="transcript" aria-live="polite">
            <div class="bubble bubble-bot">Ask me something. I answer from the instructions set in the <code>ask</code> function, so what I know is whatever you put there.</div>
        </div>

        <form class="choices" id="composer">
            <label class="sr-only" for="message">Your question</label>
            <textarea id="message" rows="1" placeholder="Type a question" autocomplete="off"></textarea>
            <button type="submit" id="send" class="btn btn-primary btn-sm">Ask</button>
        </form>

        <p class="notice" id="notice" hidden><span class="bar"></span><span id="notice-text"></span></p>
    </div>

    <script src="/scripts/chat.js"></script>
</body>
</html>`,
    },
    {
      path: '/scripts/chat.js',
      content: `/*
 * Sends the conversation to the "ask" server function, which holds the API key and
 * talks to the model. Nothing secret is in this file, and nothing secret should be:
 * everything here is downloaded by every visitor.
 */

(function () {
  var history = [];
  var busy = false;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function addBubble(who, text) {
    var transcript = document.getElementById('transcript');
    var bubble = el('div', 'bubble bubble-' + who, text);
    transcript.appendChild(bubble);
    transcript.scrollTop = transcript.scrollHeight;
    return bubble;
  }

  function setBusy(value) {
    busy = value;
    document.getElementById('send').disabled = value;
    document.getElementById('message').disabled = value;
  }

  function notice(text) {
    var node = document.getElementById('notice');
    // Only the text, because the notice component carries a severity bar as its
    // first child and setting textContent on the node would remove it.
    document.getElementById('notice-text').textContent = text;
    node.hidden = !text;
  }

  // Is there a server behind this page? The probe returns nothing but a flag.
  function checkServer() {
    return fetch('/ai-status').then(
      function (res) { return res.ok; },
      function () { return false; }
    );
  }

  function ask(text) {
    history.push({ role: 'user', content: text });
    addBubble('you', text);
    setBusy(true);

    var thinking = addBubble('bot', 'Thinking');
    thinking.classList.add('bubble-wait');

    fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        thinking.classList.remove('bubble-wait');
        if (!result.ok || !result.data || !result.data.reply) {
          thinking.textContent =
            (result.data && result.data.error) || 'That did not work. Try again in a moment.';
          thinking.classList.add('bubble-stop');
          history.pop();
          return;
        }
        thinking.textContent = result.data.reply;
        history.push({ role: 'assistant', content: result.data.reply });
      })
      .catch(function () {
        thinking.classList.remove('bubble-wait');
        thinking.classList.add('bubble-stop');
        thinking.textContent = 'Could not reach the server.';
        history.pop();
      })
      .then(function () {
        setBusy(false);
        document.getElementById('message').focus();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('composer');
    var input = document.getElementById('message');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      input.style.height = 'auto';
      ask(text);
    });

    // Enter sends, Shift+Enter makes a new line.
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });

    checkServer().then(function (hasServer) {
      var mode = document.getElementById('mode');
      mode.hidden = false;
      if (hasServer) {
        mode.textContent = 'connected';
        mode.className = 'tag tag-ok';
      } else {
        mode.textContent = 'no server';
        mode.className = 'tag tag-warn';
        setBusy(true);
        notice(
          'No server function is reachable, so there is nothing to answer with. The API key lives ' +
            'in the ask function rather than in the browser, which means this page needs OSWS in ' +
            'Server Mode with the project deployed. Then set AI_API_KEY under Settings > Secrets ' +
            'to an OpenAI API key.'
        );
      }
    });
  });
})();`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 264, chroma: 0.19, lightness: 0.55 })}

/* The widget frame and its header. The theme spec shows the chat component
   itself; a standalone page still needs somewhere for the title and the server
   badge, and this is the same shape the Guided Chat template uses. */
.demo {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 44rem;
  margin: 0 auto;
  border-radius: 0;
  border-top: 0;
  border-bottom: 0;
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

.chat-head .tag {
  white-space: nowrap;
  flex-shrink: 0;
}

.chat {
  flex: 1;
  overflow-y: auto;
}

.bubble {
  white-space: pre-wrap;
}

/* A failed answer keeps the bubble and takes the severity colour, rather than
   becoming a different component. */
.bubble-stop {
  color: var(--stop);
  border-color: var(--stop);
}

/* The composer sits in the choices bar, which is where a chat's controls live. */
.choices textarea {
  flex: 1;
  font: inherit;
  font-size: 0.9375rem;
  resize: none;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--sunken);
  color: var(--ink);
  max-height: 8rem;
}

.choices textarea:focus {
  border-color: var(--accent);
  background: var(--raised);
  outline: none;
}

.choices textarea::placeholder {
  color: var(--ink-faint);
}

.notice {
  margin: 0 1.25rem 1.25rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}`,
    },
    {
      path: '/.PROMPT.md',
      content: `${STATIC_DOMAIN_PROMPT}

---

# This project: a chat page with the key kept on the server

The page collects a question and posts it to the \`ask\` server function. That function holds the API
key and calls the model. **This only works in Server Mode**, and that is the whole point of the
template: a static page cannot hold an API key, because everything it contains is downloaded by
every visitor.

## Where things are

- \`/scripts/chat.js\`: the browser side. Sends the conversation to \`/ask\`. **Nothing secret goes in
  here, ever.**
- The \`ask\` server function: the OpenAI call, the system prompt, and the key. Edit it under
  Settings > Functions.
- The \`ai-status\` server function: answers so the page can tell whether it has a server. It reads
  nothing and returns nothing else.
- \`AI_API_KEY\`: a secret, set under Settings > Secrets. Its value is never in the project files.
- \`/styles/style.css\`: the palette, in the \`:root\` block at the top. The accent is hue 264, and the
  only thing it fills is the Ask button.

## How this page is put together

**It is a page of questions and answers, not a messenger thread.** The question is a quiet block
hanging off a rule; the answer is prose at a reading measure below it. Answers from a model run to
several paragraphs and chat bubbles fight that, which is why the bubbles live in the Guided Chat
template instead. Keep the two different: that one is a conversation, this is a transcript somebody
reads.

The composer is sticky at the bottom, so on a long transcript the thing you came to do does not
scroll away.

## Setting it up

This is configured for the OpenAI API, calling \`gpt-5-nano-2025-08-07\`.

1. Run OSWS in Server Mode and deploy the project. Edge functions execute against a deployment, so
   the page cannot answer from the preview of a project that has never been deployed.
2. Set \`AI_API_KEY\` under Settings > Secrets to an OpenAI API key.
3. For another provider, change \`API_URL\` and \`MODEL\` at the top of the \`ask\` function. Any
   OpenAI-compatible chat completions endpoint works, which covers most providers.

Without a key the page says so instead of failing silently.

## Changing what it knows

The system prompt is the \`SYSTEM\` constant at the top of the \`ask\` function. That is where the
assistant's job, tone and limits go. Everything the assistant should know about a business belongs
there, because there is no retrieval in this template: it does not read the project's files.

## Rules for the server function

These are the ones that will bite you, and they are specific to this runtime:

- **Pass \`body\` as an object, not a string.** The runtime serialises it for you, so
  \`body: JSON.stringify(payload)\` gets encoded twice and the API rejects it.
- \`request.body\` is already parsed. Guard with
  \`typeof request.body === 'string' ? JSON.parse(request.body) : request.body\` and it works either way.
- \`Response.json(data, status)\` takes a **number** for status, not \`{ status }\`.
- Newer OpenAI models reject \`max_tokens\` and \`temperature\`. Use \`max_completion_tokens\`,
  and leave temperature unset unless the model is known to accept it.
- A function may make at most 10 fetch requests and gets 30 seconds. \`timeoutMs\` is already set to
  the maximum, because model calls are slow.
- There is no streaming. The reply arrives whole, which is why the page shows "Thinking…" rather
  than typing it out. Do not try to add streaming; the runtime returns one response.

## Things worth being honest about

- **The conversation is sent to whichever provider the key belongs to.** If this is put in front of
  the public, say so on the page.
- **Nothing is stored.** No transcript, no logs beyond the function's own. Reloading starts over.
  Keeping conversations means a database and telling people about it.
- **There is no rate limiting.** A published page with a working key can be used by anyone who finds
  it, and it spends your money. Before publishing anything public, add a limit in the \`ask\` function,
  or keep the deployment private.

${TEMPLATE_STYLE_PROMPT}
`,
    },
  ],
  backendFeatures: {
    edgeFunctions: [
      {
        name: 'ask',
        method: 'POST',
        code:
          "// The model call. The API key stays here and never reaches the browser.\n" +
          "//\n" +
          "// Configured for the OpenAI API. Change these three to point at another provider;\n" +
          "// anything with an OpenAI-compatible chat completions endpoint works.\n" +
          "const API_URL = 'https://api.openai.com/v1/chat/completions';\n" +
          "const MODEL = 'gpt-5-nano-2025-08-07';\n" +
          "const SYSTEM = 'You are a helpful assistant on a website. Answer briefly and plainly. If you do not know something, say so rather than guessing.';\n" +
          "\n" +
          "const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;\n" +
          "const incoming = body && body.messages;\n" +
          "\n" +
          "if (!Array.isArray(incoming) || incoming.length === 0) {\n" +
          "  Response.json({ error: 'No messages were sent.' }, 400);\n" +
          "  return;\n" +
          "}\n" +
          "\n" +
          "if (!secrets.has('AI_API_KEY')) {\n" +
          "  Response.json({ error: 'AI_API_KEY is not set. Add it under Settings > Secrets.' }, 503);\n" +
          "  return;\n" +
          "}\n" +
          "\n" +
          "// Only role and content go on, and only the last few turns: whatever the browser sent\n" +
          "// is untrusted, and an unbounded history would grow the cost of every request.\n" +
          "const messages = incoming.slice(-12).map(function (m) {\n" +
          "  const role = m && m.role === 'assistant' ? 'assistant' : 'user';\n" +
          "  const content = String((m && m.content) || '').slice(0, 4000);\n" +
          "  return { role: role, content: content };\n" +
          "});\n" +
          "\n" +
          "const response = await fetch(API_URL, {\n" +
          "  method: 'POST',\n" +
          "  headers: {\n" +
          "    'Authorization': 'Bearer ' + secrets.get('AI_API_KEY'),\n" +
          "    'Content-Type': 'application/json'\n" +
          "  },\n" +
          "  // An object, not JSON.stringify(...): the runtime serialises the body itself, and\n" +
          "  // handing it a string sends a quoted string the API will reject.\n" +
          "  body: {\n" +
          "    model: MODEL,\n" +
          "    messages: [{ role: 'system', content: SYSTEM }].concat(messages),\n" +
          "    // Reasoning models spend part of this budget before writing anything, so a figure that\n" +
          "    // looks generous for the visible answer can return nothing at all. 600 was empty.\n" +
          "    max_completion_tokens: 2000\n" +
          "  }\n" +
          "});\n" +
          "\n" +
          "if (!response.ok) {\n" +
          "  const detail = await response.text();\n" +
          "  console.error('Model call failed: ' + response.status + ' ' + detail);\n" +
          "  Response.json({ error: 'The model could not be reached. Check the key and the model name.' }, 502);\n" +
          "  return;\n" +
          "}\n" +
          "\n" +
          "const data = await response.json();\n" +
          "const choice = data && data.choices && data.choices[0];\n" +
          "const reply = choice && choice.message && choice.message.content;\n" +
          "\n" +
          "if (!reply) {\n" +
          "  console.error('Model returned no content');\n" +
          "  Response.json({ error: 'The model returned an empty reply.' }, 502);\n" +
          "  return;\n" +
          "}\n" +
          "\n" +
          "Response.json({ reply: reply });",
        description: 'Send the conversation to the model and return its reply',
        enabled: true,
        timeoutMs: 30000,
      },
      {
        name: 'ai-status',
        method: 'GET',
        code: "Response.json({ ok: true });",
        description: 'Reports that the page has a server to ask through',
        enabled: true,
        timeoutMs: 5000,
      },
    ],
    secrets: [
      {
        name: 'AI_API_KEY',
        description: 'API key for the model provider. Used only inside the ask function; never sent to the browser.',
      },
    ],
  },
};
