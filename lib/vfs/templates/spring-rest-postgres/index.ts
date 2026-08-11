import { ProjectTemplate } from '../../project-templates';
import { templateStylesheet } from '../theme';


export const SPRING_REST_POSTGRES_PROJECT_TEMPLATE: ProjectTemplate = {
  name: "Spring Boot REST API",
  description: "A layered Spring Boot and PostgreSQL service to edit here and run elsewhere: controller, service, repository, migrations, tests and Docker Compose. OSWS cannot build or run Java, so it is exported and run with Maven",
  directories: [
    "/docs",
    "/docs/adr",
    "/src/main/java/com/example/service",
    "/src/main/java/com/example/service/api",
    "/src/main/java/com/example/service/application",
    "/src/main/java/com/example/service/domain",
    "/src/main/java/com/example/service/infrastructure",
    "/src/main/resources",
    "/src/main/resources/db/migration",
    "/src/test/java/com/example/service",
  ],
  files: [
    {
      path: "/.PROMPT.md",
      content: `# Spring Boot REST API, working on this in OSWS

A Java project stored and edited in OSWS, **built and run outside it**. Read \`/AGENTS.md\` first: it
holds the rules for changing this code and travels with the repository. This file covers only what
is different about editing it here.

## OSWS cannot run this

There is no Java, no Maven, no Docker and no PostgreSQL in this environment. Nothing in this
project has been compiled, started or tested by anything that produced it.

That means:

- **Never say the project builds, compiles, passes tests or runs.** You have not observed any of
  those things and cannot. Say what you changed, and say that it is unverified.
- **A green Preview means nothing.** \`/index.html\` is a note about the project, not the service.
  Do not treat it as evidence, and do not turn it into the application's frontend.
- **Give the commands instead.** After a change, tell the user what to run to check it:
  \`mvn test\`, \`mvn verify\`, \`docker compose up -d\` and \`mvn spring-boot:run\`.
- Pinned dependency versions in \`pom.xml\` have not been resolved against a repository. If one is
  wrong, only a real build will say so.

## Getting it out of OSWS

Download the project from the File Explorer. Every file arrives at its real path, so the unzipped
folder is a working Maven project: \`mvn spring-boot:run\` from the top of it.

## Editing here

Everything in \`/AGENTS.md\` applies. The layer rule in particular is easy to break in an editor
without a compiler to complain, so check the package an import crosses into before adding it.

When adding a resource, the shape is: migration, domain model, repository method, service method,
DTOs, controller method, unit test. Skipping the migration is the one that fails at startup rather
than at compile time.

## What not to do

- Do not add a JavaScript frontend to this project. It is an API. A frontend is a separate project
  that talks to it.
- Do not rewrite it to fit a runtime OSWS can execute. It is a Project Kit deliberately: OSWS keeps
  the files and the history, and the build happens where the tools are.
- Do not put a real password, connection string or key in any file. \`.env.example\` holds
  placeholders and \`.env\` is gitignored.
- Keep the note on \`/index.html\` saying the page describes the project rather than the running
  service. It is the only thing on screen that says so.
`,
    },
    {
      path: "/.env.example",
      content: `# Copy to .env and edit. .env is gitignored; this file is not, so it must never hold a real secret.
DB_URL=jdbc:postgresql://localhost:5432/service
DB_USERNAME=service
DB_PASSWORD=service

SERVER_PORT=8080
`,
    },
    {
      path: "/.gitignore",
      content: `target/
.env
*.log

.idea/
*.iml
.vscode/
.DS_Store
`,
    },
    {
      path: "/AGENTS.md",
      content: `# Working on this repository

Instructions for whoever or whatever changes this code. Written to travel with the repository, so
it applies just as much after the project has been exported.

## Read first

- \`docs/architecture.md\`: the layer rule, and why the model, the entity and the DTO are three
  separate types.
- \`docs/adr/\`: decisions already made, and what they cost. Do not quietly reverse one; add a new
  ADR if it should change.

## The rules

1. **Dependencies point inwards.** \`api → application → domain ← infrastructure\`. \`domain\` imports
   nothing from Spring or JPA. If a change needs an import that breaks this, the change is in the
   wrong package.
2. **Controllers stay thin.** They translate HTTP and nothing else. A conditional in a controller
   is usually a rule that belongs in a service.
3. **Never return a JPA entity from a controller.** Map to a response DTO. Returning the entity
   publishes every field anyone adds later.
4. **Constructor injection only.** No \`@Autowired\` fields. It keeps dependencies visible and keeps
   the class constructible in a test.
5. **Add a migration, never edit one.** Flyway checksums applied migrations; editing one stops the
   application starting. Add \`V<n>__description.sql\`.
6. **Behaviour change means a test change.** \`WidgetServiceTest\` needs no database and no Spring
   context; keep it that way, and keep new behaviour covered there rather than in an integration
   test.
7. **Ask before adding a dependency.** Every one is a supply chain, a licence and an upgrade
   obligation. Say what it replaces and why the standard library or Spring cannot do it.
8. **Validate at the edge.** Constraints belong on the request DTO. Do not accept an unvalidated
   type into a service.

## Conventions

- Java 21. Records for DTOs and for the domain model.
- Package names are lowercase; classes describe what they are (\`WidgetService\`, not \`WidgetManager\`).
- Errors become \`ProblemDetail\` through \`ApiExceptionHandler\`. Do not build error JSON by hand, and
  do not put stack traces or exception class names in a response.
- Configuration comes from environment variables with a development default in \`application.yml\`.
  **No credential is ever committed.** \`.env\` is gitignored; \`.env.example\` holds placeholders.

## Verifying your work

\`\`\`bash
docker compose up -d
mvn test        # unit tests, no database
mvn verify      # everything
mvn spring-boot:run
\`\`\`

**Run these before claiming anything works.** If you cannot run them, say so explicitly and say
what remains unverified. Do not describe code as tested, compiling or working on the basis of
having written it carefully.
`,
    },
    {
      path: "/CHANGELOG.md",
      content: `# Changelog

## Unreleased

- Initial scaffold: widget resource, Flyway migration, layered structure, unit tests.
`,
    },
    {
      path: "/README.md",
      content: `# service

A Spring Boot REST API over PostgreSQL, arranged in layers: HTTP at the edge, behaviour in the
middle, persistence at the back.

## Run it

\`\`\`bash
docker compose up -d          # PostgreSQL on :5432
cp .env.example .env          # then edit it
mvn spring-boot:run
\`\`\`

- API: \`http://localhost:8080/api/widgets\`
- Health: \`http://localhost:8080/actuator/health\`

## Test it

\`\`\`bash
mvn test                      # unit tests, no database needed
mvn verify                    # everything
\`\`\`

\`ApplicationContextTest\` is disabled: it needs a live PostgreSQL. Start the database, or add
Testcontainers, then remove the \`@Disabled\`.

## The API

| Method | Path | What it does |
|---|---|---|
| \`POST\` | \`/api/widgets\` | Create one. 409 if the name is taken. |
| \`GET\` | \`/api/widgets/{id}\` | Fetch one. 404 if unknown. |
| \`GET\` | \`/api/widgets?limit=&offset=\` | A page. \`limit\` is clamped to 100. |
| \`POST\` | \`/api/widgets/{id}/quantity\` | Adjust by \`delta\`. 400 below zero. |
| \`DELETE\` | \`/api/widgets/{id}\` | Remove one. |

\`\`\`bash
curl -X POST localhost:8080/api/widgets \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Bolt","description":"A bolt","quantity":5}'
\`\`\`

## Layout

\`\`\`
api/             controllers, request and response DTOs, error handling
application/     services: the behaviour
domain/          model and repository interfaces
infrastructure/  JPA entities and the repository implementation
resources/db/migration/   Flyway migrations, append-only
\`\`\`

Dependencies point inwards. \`domain\` knows nothing about Spring or JPA, which is why the service
can be unit-tested with no framework at all.

See \`docs/architecture.md\` for why, and \`AGENTS.md\` for the rules to follow when changing it.
`,
    },
    {
      path: "/compose.yaml",
      content: `# PostgreSQL for local development. The application is run with Maven, not from here, so that a
# rebuild is a restart rather than an image build.
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: service
      POSTGRES_USER: service
      POSTGRES_PASSWORD: service
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U service"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  db-data:
`,
    },
    {
      path: "/docs/adr/0001-project-structure.md",
      content: `# 1. Layered structure with an inward dependency rule

Date: 2026-08-06

## Status

Accepted.

## Context

A Spring service can be arranged by technical layer (\`controllers\`, \`services\`, \`repositories\`) or
by feature, and either can be built with the domain model doubling as the JPA entity. The choice
mostly decides how much of the application can be tested without starting anything.

## Decision

Four packages: \`api\`, \`application\`, \`domain\`, \`infrastructure\`, with dependencies pointing inwards.
The domain model is a separate type from the JPA entity, and both are separate from the response
DTO. Repository interfaces live in \`domain\`; their implementations live in \`infrastructure\`.

## Consequences

- The application layer is unit-testable with no Spring context and no database.
- Three types describe a widget, and adding a field means touching all three. This is the cost, and
  it is deliberate: it is also what stops a database column change from becoming an API change.
- The mapping functions in \`JpaWidgetRepository\` are boilerplate. A mapping library would remove
  them and add a dependency plus a layer of magic; at this size, the boilerplate is cheaper.
`,
    },
    {
      path: "/docs/architecture.md",
      content: `# Architecture

## The shape

Four layers, dependencies pointing inwards:

\`\`\`
api  ──▶  application  ──▶  domain  ◀──  infrastructure
\`\`\`

- **\`api\`** turns HTTP into calls and results into JSON. No rules live here.
- **\`application\`** holds the behaviour. It depends on interfaces, not on a database.
- **\`domain\`** is the model and the repository interfaces. It imports nothing from Spring or JPA.
- **\`infrastructure\`** implements the domain's interfaces with JPA.

The reason for the arrow direction is testability. \`WidgetServiceTest\` constructs the service with
an in-memory stub and runs in milliseconds with no Spring context and no database. That stops being
possible the moment the service depends on a JPA repository directly.

## Why the model is not an entity

\`Widget\` is a record; \`WidgetEntity\` is the row. Merging them saves a mapping function and costs
the ability to change either independently: a column rename becomes an API change, and JPA's
lifecycle rules start applying to objects the domain wants to treat as values.

\`WidgetResponse\` is a third type for the same reason in the other direction. Serialising the entity
would publish every field anyone adds to it later, including ones nobody meant to expose.

## Migrations

Flyway owns the schema; \`spring.jpa.hibernate.ddl-auto\` is \`validate\`, so Hibernate checks the
schema and never changes it.

Migrations are append-only. Flyway records a checksum for each one it has applied, so editing a
migration that has run anywhere makes the application refuse to start. Add \`V2__...sql\` instead.

## Known limits

- **Offset paging.** \`LIMIT/OFFSET\` gets slower the deeper you page, because the database still
  walks the skipped rows. Fine for thousands, wrong for millions: move to keyset paging (\`WHERE
  created_at < ?\`) before it matters.
- **No authentication.** Every endpoint is open. Add Spring Security before this is reachable from
  anywhere you do not control.
- **No rate limiting**, and no request size cap beyond the DTO constraints.
- **\`docker compose\` is for development.** It has a password in it, one replica and no backups.
`,
    },
    {
      path: "/index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spring Boot REST API, project overview</title>
    <!--
      The stylesheet is inline rather than in /styles/, because this is a Java
      project and a stray web folder in its tree would be exported along with
      the source and read as part of the service.
    -->
    <style>
${templateStylesheet({ hue: 150, chroma: 0.16, lightness: 0.55, radius: 6, scheme: 'dark' })}

/*
  This page commits to dark, and it is the only template that does. It is read
  next to a terminal by whoever is about to export the project and run it, not
  by a customer.
*/
:root {
  /* Labels go mono here: everything this page labels is a path or a command. */
  --font-label: var(--mono);
  --label-weight: 500;
}

.wrap {
  max-width: 46rem;
}

/* The shared headings carry no margin, because most templates space their
   sections with a band. This page is one column of prose, so the rhythm has to
   come from the type itself. */
h2 {
  margin-top: 2.5rem;
}

h2 + p {
  margin-top: 0.6rem;
}

.notice,
pre,
.table-scroll {
  margin-top: 1.25rem;
}

pre + p,
.table-scroll + h2 {
  margin-top: 1.25rem;
}
    </style>
</head>
<body>
    <div class="wrap">
        <p class="label">Spring Boot &middot; PostgreSQL &middot; Maven</p>
        <h1>A project you edit here and run somewhere else</h1>

        <p class="muted">
            A REST API in layers: controllers over services over repositories, with Flyway
            migrations and a Docker Compose file for the database. OSWS holds the files and the
            assistant edits them; Java, Maven and PostgreSQL run on your own machine. So this page
            is a description of the project rather than the service, which starts once you have
            downloaded it.
        </p>

        <h2>Running it</h2>
        <p class="muted">Download the project from the File Explorer, unzip it, then:</p>
<pre><code>docker compose up -d          # PostgreSQL on :5432
cp .env.example .env          # then edit it
mvn spring-boot:run</code></pre>
        <p class="muted">
            It listens on <code>:8080</code>, with health at <code>/actuator/health</code>. There is
            no Maven wrapper in here, so use your own Maven or run
            <code>mvn wrapper:wrapper</code> to generate one.
        </p>

        <h2>What is in here</h2>
        <div class="table-scroll">
            <table>
                <thead><tr><th>Path</th><th>What it is</th></tr></thead>
                <tbody>
                    <tr><td><code>src/main/java/.../api</code></td><td>Controllers and DTOs. Thin.</td></tr>
                    <tr><td><code>src/main/java/.../application</code></td><td>Services. The behaviour lives here.</td></tr>
                    <tr><td><code>src/main/java/.../domain</code></td><td>Model and repository interfaces.</td></tr>
                    <tr><td><code>src/main/java/.../infrastructure</code></td><td>JPA entities and adapters.</td></tr>
                    <tr><td><code>src/main/resources/db/migration</code></td><td>Flyway migrations.</td></tr>
                    <tr><td><code>AGENTS.md</code></td><td>Instructions that travel with the repository.</td></tr>
                    <tr><td><code>docs/architecture.md</code></td><td>Why it is arranged this way.</td></tr>
                </tbody>
            </table>
        </div>

        <h2>Editing it here</h2>
        <p class="muted">
            The assistant reads and writes every file here, and <code>.PROMPT.md</code> tells it the
            conventions this project keeps: which layer owns what, and the order to add a resource
            in. Compiling and testing come after the download, with the commands above.
        </p>
    </div>
</body>
</html>
`,
    },
    {
      path: "/pom.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!--
      Versions are pinned deliberately. Nothing here resolves or updates them, so check them against
      a real build.
    -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.5</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>service</artifactId>
    <version>0.1.0-SNAPSHOT</version>
    <name>service</name>
    <description>REST API with PostgreSQL</description>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`,
    },
    {
      path: "/src/main/java/com/example/service/Application.java",
      content: `package com.example.service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/api/AdjustQuantityRequest.java",
      content: `package com.example.service.api;

public record AdjustQuantityRequest(int delta) {
}
`,
    },
    {
      path: "/src/main/java/com/example/service/api/ApiExceptionHandler.java",
      content: `package com.example.service.api;

import com.example.service.domain.DuplicateWidgetNameException;
import com.example.service.domain.WidgetNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

/**
 * One place that turns exceptions into responses, so no controller has to.
 *
 * Uses ProblemDetail (RFC 9457) rather than an ad-hoc shape, and deliberately does not include
 * stack traces or exception class names: those tell an attacker about the internals and tell a
 * client nothing it can act on.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(WidgetNotFoundException.class)
    public ProblemDetail onNotFound(WidgetNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(DuplicateWidgetNameException.class)
    public ProblemDetail onDuplicate(DuplicateWidgetNameException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail onIllegalArgument(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail onValidationFailure(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/api/CreateWidgetRequest.java",
      content: `package com.example.service.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** What a client may send. Constraints here are checked before the controller method runs. */
public record CreateWidgetRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 2000) String description,
        @Min(0) int quantity
) {
}
`,
    },
    {
      path: "/src/main/java/com/example/service/api/WidgetController.java",
      content: `package com.example.service.api;

import com.example.service.application.WidgetService;
import com.example.service.domain.Widget;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.UUID;

/**
 * HTTP in, DTOs out. No business rules and no persistence: if a method here does more than
 * translate, the logic belongs in WidgetService.
 */
@RestController
@RequestMapping("/api/widgets")
public class WidgetController {

    private static final int MAX_LIMIT = 100;

    private final WidgetService widgets;

    public WidgetController(WidgetService widgets) {
        this.widgets = widgets;
    }

    @PostMapping
    public ResponseEntity<WidgetResponse> create(
            @Valid @RequestBody CreateWidgetRequest request,
            UriComponentsBuilder uri
    ) {
        Widget created = widgets.create(request.name(), request.description(), request.quantity());
        URI location = uri.path("/api/widgets/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(WidgetResponse.from(created));
    }

    @GetMapping("/{id}")
    public WidgetResponse get(@PathVariable UUID id) {
        return WidgetResponse.from(widgets.get(id));
    }

    @GetMapping
    public WidgetPage list(
            @RequestParam(defaultValue = "25") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        // Clamped rather than trusted: a limit is what the caller asked for, not what they get.
        int safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        int safeOffset = Math.max(offset, 0);

        List<WidgetResponse> items = widgets.list(safeLimit, safeOffset).stream()
                .map(WidgetResponse::from)
                .toList();

        return new WidgetPage(items, widgets.count(), safeLimit, safeOffset);
    }

    @PostMapping("/{id}/quantity")
    public WidgetResponse adjustQuantity(@PathVariable UUID id, @Valid @RequestBody AdjustQuantityRequest request) {
        return WidgetResponse.from(widgets.adjustQuantity(id, request.delta()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        widgets.delete(id);
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/api/WidgetPage.java",
      content: `package com.example.service.api;

import java.util.List;

public record WidgetPage(List<WidgetResponse> items, long total, int limit, int offset) {
}
`,
    },
    {
      path: "/src/main/java/com/example/service/api/WidgetResponse.java",
      content: `package com.example.service.api;

import com.example.service.domain.Widget;

import java.time.Instant;
import java.util.UUID;

/**
 * What a client receives.
 *
 * A separate type from the domain model on purpose: returning the model, or a JPA entity, makes
 * every internal rename a breaking API change and leaks whatever gets added to it later.
 */
public record WidgetResponse(
        UUID id,
        String name,
        String description,
        int quantity,
        Instant createdAt,
        Instant updatedAt
) {

    public static WidgetResponse from(Widget widget) {
        return new WidgetResponse(
                widget.id(),
                widget.name(),
                widget.description(),
                widget.quantity(),
                widget.createdAt(),
                widget.updatedAt()
        );
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/application/WidgetService.java",
      content: `package com.example.service.application;

import com.example.service.domain.DuplicateWidgetNameException;
import com.example.service.domain.Widget;
import com.example.service.domain.WidgetNotFoundException;
import com.example.service.domain.WidgetRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The behaviour. Controllers translate HTTP into calls on this; storage is behind the repository
 * interface. Everything that decides something belongs here, which is what makes it testable
 * without a web server or a database.
 */
@Service
public class WidgetService {

    private final WidgetRepository repository;

    // Constructor injection, not field injection: it makes the dependencies visible in the
    // signature and lets a test construct the class with a stub and no Spring context.
    public WidgetService(WidgetRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public Widget create(String name, String description, int quantity) {
        repository.findByName(name).ifPresent(existing -> {
            throw new DuplicateWidgetNameException(name);
        });

        Instant now = Instant.now();
        return repository.save(new Widget(UUID.randomUUID(), name, description, quantity, now, now));
    }

    @Transactional(readOnly = true)
    public Widget get(UUID id) {
        return repository.findById(id).orElseThrow(() -> new WidgetNotFoundException(id));
    }

    @Transactional(readOnly = true)
    public List<Widget> list(int limit, int offset) {
        return repository.findAll(limit, offset);
    }

    @Transactional(readOnly = true)
    public long count() {
        return repository.count();
    }

    @Transactional
    public Widget adjustQuantity(UUID id, int delta) {
        Widget widget = get(id);
        int updated = widget.quantity() + delta;
        if (updated < 0) {
            throw new IllegalArgumentException("Quantity cannot fall below zero");
        }
        return repository.save(widget.withQuantity(updated));
    }

    @Transactional
    public void delete(UUID id) {
        if (repository.findById(id).isEmpty()) {
            throw new WidgetNotFoundException(id);
        }
        repository.deleteById(id);
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/domain/DuplicateWidgetNameException.java",
      content: `package com.example.service.domain;

public class DuplicateWidgetNameException extends RuntimeException {

    public DuplicateWidgetNameException(String name) {
        super("A widget named \\"" + name + "\\" already exists");
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/domain/Widget.java",
      content: `package com.example.service.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * The domain model.
 *
 * Deliberately not a JPA entity: persistence annotations here would make the model a description
 * of the database rather than of the problem, and every layer above would inherit that. The
 * mapping lives in infrastructure.
 */
public record Widget(
        UUID id,
        String name,
        String description,
        int quantity,
        Instant createdAt,
        Instant updatedAt
) {

    public Widget withQuantity(int newQuantity) {
        return new Widget(id, name, description, newQuantity, createdAt, Instant.now());
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/domain/WidgetNotFoundException.java",
      content: `package com.example.service.domain;

import java.util.UUID;

public class WidgetNotFoundException extends RuntimeException {

    public WidgetNotFoundException(UUID id) {
        super("No widget with id " + id);
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/domain/WidgetRepository.java",
      content: `package com.example.service.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What the application layer needs from storage, expressed in domain terms.
 *
 * The interface is here and the implementation is in infrastructure, so the direction of the
 * dependency runs inwards: the domain does not know what a database is.
 */
public interface WidgetRepository {

    Widget save(Widget widget);

    Optional<Widget> findById(UUID id);

    Optional<Widget> findByName(String name);

    List<Widget> findAll(int limit, int offset);

    long count();

    void deleteById(UUID id);
}
`,
    },
    {
      path: "/src/main/java/com/example/service/infrastructure/JpaWidgetRepository.java",
      content: `package com.example.service.infrastructure;

import com.example.service.domain.Widget;
import com.example.service.domain.WidgetRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The adapter between the domain's repository interface and JPA. Mapping lives here so that
 * neither the domain nor the application layer has an opinion about persistence.
 */
@Repository
public class JpaWidgetRepository implements WidgetRepository {

    private final WidgetJpaRepository jpa;

    public JpaWidgetRepository(WidgetJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Widget save(Widget widget) {
        WidgetEntity saved = jpa.save(toEntity(widget));
        return toDomain(saved);
    }

    @Override
    public Optional<Widget> findById(UUID id) {
        return jpa.findById(id).map(JpaWidgetRepository::toDomain);
    }

    @Override
    public Optional<Widget> findByName(String name) {
        return jpa.findByNameIgnoringCase(name).map(JpaWidgetRepository::toDomain);
    }

    @Override
    public List<Widget> findAll(int limit, int offset) {
        // Offset paging is fine at this size and wrong at scale; see docs/architecture.md before
        // pointing this at a large table.
        int page = offset / Math.max(limit, 1);
        return jpa.findAll(PageRequest.of(page, limit, Sort.by("createdAt").descending()))
                .map(JpaWidgetRepository::toDomain)
                .toList();
    }

    @Override
    public long count() {
        return jpa.count();
    }

    @Override
    public void deleteById(UUID id) {
        jpa.deleteById(id);
    }

    private static WidgetEntity toEntity(Widget widget) {
        return new WidgetEntity(
                widget.id(),
                widget.name(),
                widget.description(),
                widget.quantity(),
                widget.createdAt(),
                widget.updatedAt()
        );
    }

    private static Widget toDomain(WidgetEntity entity) {
        return new Widget(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getQuantity(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/infrastructure/WidgetEntity.java",
      content: `package com.example.service.infrastructure;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** The database row. Never returned from a controller; see WidgetResponse. */
@Entity
@Table(name = "widgets")
public class WidgetEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected WidgetEntity() {
        // Required by JPA.
    }

    public WidgetEntity(UUID id, String name, String description, int quantity, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.quantity = quantity;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public int getQuantity() { return quantity; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
`,
    },
    {
      path: "/src/main/java/com/example/service/infrastructure/WidgetJpaRepository.java",
      content: `package com.example.service.infrastructure;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

interface WidgetJpaRepository extends JpaRepository<WidgetEntity, UUID> {

    @Query("select w from WidgetEntity w where lower(w.name) = lower(?1)")
    Optional<WidgetEntity> findByNameIgnoringCase(String name);
}
`,
    },
    {
      path: "/src/main/resources/application.yml",
      content: `spring:
  application:
    name: service

  datasource:
    url: \${DB_URL:jdbc:postgresql://localhost:5432/service}
    username: \${DB_USERNAME:service}
    password: \${DB_PASSWORD:service}

  jpa:
    hibernate:
      # Flyway owns the schema. Letting Hibernate generate it as well means two sources of truth
      # and a production database that drifts from the migrations.
      ddl-auto: validate
    open-in-view: false

  flyway:
    enabled: true
    locations: classpath:db/migration

server:
  port: \${SERVER_PORT:8080}

management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      probes:
        enabled: true
`,
    },
    {
      path: "/src/main/resources/db/migration/V1__create_widgets.sql",
      content: `-- Migrations are append-only. To change this table, add V2__...sql; never edit a migration that
-- has run anywhere, because Flyway records its checksum and will refuse to start.
CREATE TABLE widgets (
    id          UUID PRIMARY KEY,
    name        VARCHAR(120)  NOT NULL,
    description VARCHAR(2000),
    quantity    INTEGER       NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_widgets_name ON widgets (lower(name));
`,
    },
    {
      path: "/src/test/java/com/example/service/ApplicationContextTest.java",
      content: `package com.example.service;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Where integration tests go.
 *
 * Disabled because it needs a PostgreSQL that a plain \`mvn test\` has no way to start. Enable it
 * once you have added Testcontainers, or run it with \`docker compose up -d\` already running and
 * the datasource pointed at it. Leaving it enabled and failing teaches everyone to ignore red.
 */
@SpringBootTest
@Disabled("Needs a PostgreSQL instance. See docs/architecture.md.")
class ApplicationContextTest {

    @Test
    void contextLoads() {
        // Fails if a bean cannot be constructed, which is most misconfiguration.
    }
}
`,
    },
    {
      path: "/src/test/java/com/example/service/WidgetServiceTest.java",
      content: `package com.example.service;

import com.example.service.application.WidgetService;
import com.example.service.domain.DuplicateWidgetNameException;
import com.example.service.domain.Widget;
import com.example.service.domain.WidgetNotFoundException;
import com.example.service.domain.WidgetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The behaviour, tested without Spring, a web server or a database.
 *
 * That is possible because WidgetService depends on an interface it was given, which is the whole
 * reason the repository interface lives in the domain rather than in infrastructure.
 */
class WidgetServiceTest {

    private InMemoryWidgetRepository repository;
    private WidgetService service;

    @BeforeEach
    void setUp() {
        repository = new InMemoryWidgetRepository();
        service = new WidgetService(repository);
    }

    @Test
    void createsAWidget() {
        Widget created = service.create("Bolt", "A bolt", 5);

        assertEquals("Bolt", created.name());
        assertEquals(5, created.quantity());
        assertEquals(created, service.get(created.id()));
    }

    @Test
    void refusesADuplicateName() {
        service.create("Bolt", null, 1);

        assertThrows(DuplicateWidgetNameException.class, () -> service.create("Bolt", null, 1));
    }

    @Test
    void reportsAnUnknownId() {
        assertThrows(WidgetNotFoundException.class, () -> service.get(UUID.randomUUID()));
    }

    @Test
    void adjustsQuantityUpAndDown() {
        Widget created = service.create("Bolt", null, 5);

        assertEquals(8, service.adjustQuantity(created.id(), 3).quantity());
        assertEquals(6, service.adjustQuantity(created.id(), -2).quantity());
    }

    @Test
    void refusesToTakeQuantityBelowZero() {
        Widget created = service.create("Bolt", null, 1);

        assertThrows(IllegalArgumentException.class, () -> service.adjustQuantity(created.id(), -2));
        assertEquals(1, service.get(created.id()).quantity());
    }

    /** A stub, not a mock: the assertions are about what the service did, not about calls made. */
    private static final class InMemoryWidgetRepository implements WidgetRepository {

        private final Map<UUID, Widget> byId = new LinkedHashMap<>();

        @Override
        public Widget save(Widget widget) {
            byId.put(widget.id(), widget);
            return widget;
        }

        @Override
        public Optional<Widget> findById(UUID id) {
            return Optional.ofNullable(byId.get(id));
        }

        @Override
        public Optional<Widget> findByName(String name) {
            return byId.values().stream()
                    .filter(widget -> widget.name().equalsIgnoreCase(name))
                    .findFirst();
        }

        @Override
        public List<Widget> findAll(int limit, int offset) {
            return byId.values().stream().skip(offset).limit(limit).toList();
        }

        @Override
        public long count() {
            return byId.size();
        }

        @Override
        public void deleteById(UUID id) {
            byId.remove(id);
        }
    }
}
`,
    },
  ],
};
