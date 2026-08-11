import { ProjectTemplate } from '../../project-templates';
import { VUE_DOMAIN_PROMPT } from '@/lib/llm/prompts/vue';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const PROJECT_TRACKER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Projects & Tasks',
  description: 'A board of what you are working on and what is left, kept up to date by asking the assistant',
  directories: ['/src', '/src/components', '/styles'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Projects &amp; Tasks</title>
    <link rel="stylesheet" href="/bundle.css">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
</body>
</html>`,
    },
    {
      path: '/src/main.ts',
      content: `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#root");`,
    },
    {
      path: '/src/App.vue',
      content: `<!--
  The board. It only reads.

  There is deliberately no way to tick something off here. A static page cannot
  write back to the project, so a checkbox would either lose the change on reload
  or hide it in browser storage where the assistant cannot see it, and the board
  would then disagree with tasks.json. Asking the assistant keeps one source of
  truth.
-->
<script setup>
import { computed, onMounted, ref } from "vue";
import ProjectFilter from "./components/ProjectFilter.vue";
import Column from "./components/Column.vue";

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "done", label: "Done" },
];

const data = ref(null);
const error = ref(null);
const project = ref("all");

// Root-relative resolves in the preview, relative on a published deployment
// under /deployments/{id}/. Trying both keeps one file working in both places.
async function loadJSON(path) {
  const bare = path.startsWith("/") ? path.slice(1) : path;
  for (const url of ["/" + bare, bare]) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // try the next candidate
    }
  }
  throw new Error("Could not load " + path);
}

onMounted(async () => {
  try {
    data.value = await loadJSON("tasks.json");
    document.title = data.value.title || "Projects & Tasks";
  } catch {
    error.value = "tasks.json could not be loaded. It should sit at the root of the project.";
  }
});

const projects = computed(() => data.value?.projects ?? []);
const allTasks = computed(() => data.value?.tasks ?? []);

const visible = computed(() =>
  allTasks.value.filter((t) => project.value === "all" || t.project === project.value)
);

const openCounts = computed(() => {
  const counts = {};
  for (const p of projects.value) {
    counts[p.id] = allTasks.value.filter(
      (t) => t.project === p.id && t.status !== "done"
    ).length;
  }
  return counts;
});

const objective = computed(() => {
  if (project.value === "all") return null;
  return projects.value.find((p) => p.id === project.value)?.objective ?? null;
});

function projectName(id) {
  return projects.value.find((p) => p.id === id)?.name ?? id;
}
</script>

<template>
  <header class="wrap site-head">
    <span class="brand">{{ data?.title || "Projects &amp; Tasks" }}</span>
    <span class="faint told">Changes are made by asking the assistant</span>
  </header>

  <div class="wrap">
    <p v-if="error" class="notice notice-stop"><span class="bar"></span><span>{{ error }}</span></p>

    <template v-else>
      <p v-if="data?.subtitle" class="lede muted">{{ data.subtitle }}</p>

      <ProjectFilter
        :projects="projects"
        :counts="openCounts"
        :selected="project"
        @select="(id) => (project = id)"
      />

      <p v-if="objective" class="notice objective">
        <span class="bar"></span>
        <span><span class="label">What finished looks like</span><br>{{ objective }}</span>
      </p>

      <main class="board">
        <Column
          v-for="column in COLUMNS"
          :key="column.key"
          :label="column.label"
          :tasks="visible.filter((t) => t.status === column.key)"
          :show-project="project === 'all'"
          :project-name="projectName"
        />
      </main>
    </template>
  </div>
</template>`,
    },
    {
      path: '/src/components/ProjectFilter.vue',
      content: `<!--
  Filter pills. These are controls that toggle, so they carry aria-pressed and
  fill when on, which is what .filter is styled for.
-->
<script setup>
defineProps({
  projects: { type: Array, required: true },
  counts: { type: Object, required: true },
  selected: { type: String, required: true },
});
defineEmits(["select"]);
</script>

<template>
  <nav class="row-set filters" aria-label="Filter by project">
    <button
      type="button"
      class="filter"
      :aria-pressed="selected === 'all'"
      @click="$emit('select', 'all')"
    >
      Everything
    </button>

    <button
      v-for="p in projects"
      :key="p.id"
      type="button"
      class="filter"
      :aria-pressed="selected === p.id"
      @click="$emit('select', p.id)"
    >
      {{ p.name }} &middot; {{ counts[p.id] === 0 ? "all done" : counts[p.id] + " open" }}
    </button>
  </nav>
</template>`,
    },
    {
      path: '/src/components/Column.vue',
      content: `<!--
  One column of the board, and the cards in it.
-->
<script setup>
defineProps({
  label: { type: String, required: true },
  tasks: { type: Array, required: true },
  showProject: { type: Boolean, default: false },
  projectName: { type: Function, required: true },
});

// The project and the due date are one line of the same kind of thing, so they
// are joined here rather than stacked as two elements in the card.
function meta(task, showProject, projectName) {
  const parts = [];
  if (showProject) parts.push(projectName(task.project));
  if (task.due) parts.push("due " + task.due);
  return parts.join(" \\u00b7 ");
}
</script>

<template>
  <div class="column">
    <div class="col-head">
      <span class="label">{{ label }}</span>
      <span class="col-count">{{ tasks.length }}</span>
    </div>

    <p v-if="tasks.length === 0" class="faint nothing">Nothing here.</p>

    <article
      v-for="task in tasks"
      :key="task.id"
      class="task"
      :class="{ done: task.status === 'done' }"
    >
      <div class="t">{{ task.title }}</div>
      <span v-if="meta(task, showProject, projectName)" class="m">{{ meta(task, showProject, projectName) }}</span>
      <p v-if="task.notes" class="n">{{ task.notes }}</p>
    </article>
  </div>
</template>`,
    },
    {
      path: '/tasks.json',
      content: `{
  "title": "My work",
  "subtitle": "Everything on, and everything waiting.",
  "projects": [
    {
      "id": "kitchen",
      "name": "Kitchen shelves",
      "objective": "Alcove shelving up and painted before the family visit on 12 September.",
      "status": "active"
    },
    {
      "id": "site",
      "name": "Launch the studio site",
      "objective": "A one-page site with real work on it, live on my own domain.",
      "status": "active"
    },
    {
      "id": "passport",
      "name": "Renew passport",
      "objective": "Valid passport in hand before booking anything for the spring.",
      "status": "active"
    }
  ],
  "tasks": [
    {
      "id": "t1",
      "project": "kitchen",
      "title": "Measure the alcoves",
      "status": "done",
      "due": "",
      "notes": "Left 82cm wide, right 79cm. They are not the same, so the shelves cannot be cut identically."
    },
    {
      "id": "t2",
      "project": "kitchen",
      "title": "Order timber",
      "status": "doing",
      "due": "2026-08-14",
      "notes": "18mm birch ply. Ask the yard to cut to length; the car will not take a full sheet."
    },
    {
      "id": "t3",
      "project": "kitchen",
      "title": "Paint and fit",
      "status": "todo",
      "due": "2026-09-10",
      "notes": "Two coats, and let the second dry overnight before putting anything on them."
    },
    {
      "id": "t4",
      "project": "site",
      "title": "Pick the three projects to show",
      "status": "done",
      "due": "",
      "notes": "Chose the permissions rebuild, the survey tool and the onboarding work."
    },
    {
      "id": "t5",
      "project": "site",
      "title": "Write the project descriptions",
      "status": "doing",
      "due": "2026-08-20",
      "notes": "Each one needs what changed and what resulted, not a job description."
    },
    {
      "id": "t6",
      "project": "site",
      "title": "Point the domain at it",
      "status": "todo",
      "due": "",
      "notes": "Blocked until the descriptions are done. No sense publishing a placeholder."
    },
    {
      "id": "t7",
      "project": "passport",
      "title": "Get photos taken",
      "status": "todo",
      "due": "2026-08-18",
      "notes": ""
    },
    {
      "id": "t8",
      "project": "passport",
      "title": "Submit the renewal",
      "status": "todo",
      "due": "",
      "notes": "Needs the photos first. Allow six weeks after submitting."
    }
  ]
}`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 250 })}

/* Everything above is the shared theme, and the accent hue is the only thing
   this board chose. What follows is the handful of things the board needs that
   the shared components have no rule for. */

.wrap.site-head {
  padding: 0.85rem clamp(1.25rem, 4vw, 2.5rem);
}

/* The one line of orientation the board needs, and the first thing to go when
   there is no room for it beside the title. */
.told {
  font-size: 0.8125rem;
}

@media (max-width: 560px) {
  .told {
    display: none;
  }
}

.lede {
  font-size: 1.0625rem;
  margin-bottom: 1.5rem;
}

.filters {
  margin-bottom: 1.5rem;
}

.objective {
  margin-bottom: 1.75rem;
}

.objective .bar {
  background: var(--accent);
}

/* A column with nothing in it still holds its place, so the board does not
   reflow every time a filter changes what is in it. */
.nothing {
  font-size: 0.875rem;
  margin-bottom: 0.6rem;
}

/* The task note. .t and .m are shared; this is the one line of a task the
   components do not cover, and only this template has tasks. */
.task .n {
  margin: 0.45rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

.task.done .n,
.task.done .m {
  color: var(--ink-faint);
}`,
    },
    {
      path: '/.PROMPT.md',
      content: `${VUE_DOMAIN_PROMPT}

---

# This project: a task board you talk to

Projects, their tasks, and what finishing each project would mean. The page **only reads**. You make
every change by editing \`/tasks.json\`.

The seed content is one person's real-shaped list: kitchen shelves, a website, a passport renewal.
Replace it once the user says what they are actually working on.

## Where things are

- \`/tasks.json\`: all of it, the projects, the tasks, and the board's title.
- \`/src/\`: the board, as a small Vue app. \`App.vue\` holds all the state, because there is only one
  question the page answers (which project is showing); \`components/ProjectFilter.vue\` is the pills,
  \`components/Column.vue\` is one column and its cards.
- \`/index.html\`, \`/styles/style.css\`: the shell, then the shared template theme and a short tail of
  board-specific rules. The theme is generated, so the only thing to change up there is the accent
  hue, currently 250. The only thing it fills is the project filter that is currently on.

**This is a Vue project**, so the source under \`/src/\` is compiled to \`/bundle.js\` before it runs.
Add components as \`.vue\` files under \`/src/components/\` and import them; do not add a \`<script>\` tag
to \`/index.html\` expecting it to run alongside the app.

The board still **only reads**. Vue makes a checkbox easy to add, and it is still the wrong thing:
the page cannot write back to \`tasks.json\`, so a tick would either vanish on reload or live in
browser storage where you cannot see it, and the board would then disagree with the file.

## The shape of tasks.json

\`\`\`json
{
  "title": "My work",
  "subtitle": "One line under the title.",
  "projects": [
    { "id": "slug", "name": "Human name", "objective": "What finished looks like.", "status": "active | done" }
  ],
  "tasks": [
    { "id": "t9", "project": "slug", "title": "What to do", "status": "todo | doing | done",
      "due": "YYYY-MM-DD or empty", "notes": "Anything worth remembering." }
  ]
}
\`\`\`

A task's \`project\` must match a project \`id\`, or it will not show under that project's filter.

## Why there are no checkboxes

The page cannot write to the project. A checkbox would either forget the change on reload or store
it in the browser, where you cannot see it, and the board would then disagree with \`tasks.json\`.
One source of truth is worth more than a tickable box. **Do not add one**, and do not add a form for
creating tasks. If the user asks for one, explain the trade rather than building something that
quietly loses their work.

## Doing what is asked

- **"Move the onboarding work to done"**: set that task's \`status\` to \`"done"\`. Keep the task, since
  a finished list is a record.
- **"What should I work on this week?"**: read the file and answer in chat. Do not add a section to
  the page for it.
- **"Create a project for X and break it into tasks"**: add the project *with an objective*, then
  three to six tasks. An objective that just restates the name ("Launch the site: launch the site")
  is not worth writing; say what would have to be true to call it finished.
- **Never delete a project without asking.** Tasks under it lose their home.

## Conventions this project follows

- **Notes carry the thing you would otherwise forget**, like the two alcoves being different widths.
  Not a restatement of the title.
- **Say what blocks what.** "Blocked until the descriptions are done" belongs in the notes.
- **Dates only when there is a real one.** An invented due date makes the whole board untrustworthy.
- Keep \`status\` to the three the board draws: \`todo\`, \`doing\`, \`done\`. Adding a fourth means adding
  a column in \`/scripts/board.js\` as well.

${TEMPLATE_STYLE_PROMPT}
`,
    },
  ],
};
