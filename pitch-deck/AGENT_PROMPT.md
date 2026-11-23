# Agent Prompt: TSN HTML Pitch Deck

You are working on the standalone TSN HTML pitch deck repository.

## Project

- Repository: `https://github.com/Trustlink-Labs/TSN-Pitch-Deck`
- Local project folder: `pitch-deck/`
- Public website: `https://trustlink-labs.github.io/TSN-Pitch-Deck/`
- Default branch: `main`
- Deployment: GitHub Pages through GitHub Actions
- This is a static website. Do not introduce React, Vite, Node build tooling, or a server unless explicitly requested.

## Repository Boundary

This folder is a nested, standalone Git repository inside the larger TSN source project.

- The Git root for this deck is `pitch-deck/`, not the parent TSN project.
- Do not initialize Git at the parent project root.
- Do not copy or commit the parent TSN codebase into this repository.
- Do not modify unrelated files in the parent project.
- The standalone remote is `https://github.com/Trustlink-Labs/TSN-Pitch-Deck.git`.

## Files

### `index.html`

This is the entire pitch-deck application and the GitHub Pages entry point. It is a self-contained HTML document containing:

- Inline CSS and responsive layout rules
- Inline JavaScript for slide navigation and animations
- Inline SVG TSN network marks
- Inline SVG noise texture
- Google Fonts loaded externally: Fraunces, IBM Plex Mono, and Archivo
- No local asset files are currently required

Preserve the existing visual language and content unless the user explicitly requests a design or copy change. Avoid unnecessary rewrites or formatting churn.

The deck currently has 15 slides:

1. Cover
2. The problem
3. The offer
4. How it works
5. Cross-chain settlement
6. Live demo
7. Cross-chain protocol / Attestcoin
8. Architecture
9. Market
10. Business
11. Traction
12. Growth
13. Roadmap
14. Team
15. Closing

The slide system uses `.slide` sections and JavaScript toggling of the `.active` class. The navigation controls are:

- `#prevBtn`
- `#nextBtn`
- `#dots`
- Keyboard: Arrow Left, Arrow Up, Arrow Right, Arrow Down, and Space

The top-left header contains an inline SVG network logo beside the `TSN` text. Keep this logo self-contained. Do not replace it with an unnecessary external image dependency.

Interactive behaviors include:

- Slide transitions and reveal animations
- Dot navigation
- Keyboard navigation
- Animated ticker tape
- Typed TIN demo on slide 6
- Counter animation on the traction slide
- Reduced-motion support through `prefers-reduced-motion`

## GitHub Pages Workflow

### `.github/workflows/pages.yml`

This workflow deploys the repository root as a static Pages artifact whenever `main` receives a push. It also supports manual dispatch.

Important steps:

1. Checkout the repository.
2. Configure GitHub Pages.
3. Upload the repository root with `actions/upload-pages-artifact`.
4. Deploy with `actions/deploy-pages`.

Do not remove the checkout step. Without it, the artifact will not contain `index.html` and the public site will return a GitHub Pages 404.

## Package Helper

### `package.json`

There are no runtime dependencies. The only helper is:

```bash
npm run push
```

It runs:

```bash
node ../scripts/repo-security.mjs commit-push-all pitch-deck origin main
```

Use it only when the user explicitly requests publication. It uses the parent workspace's guarded Git helper, so that tooling checkout must be present. It stages nonignored changes in the standalone deck repository, captures the tree and parent, commits the captured changes and pushes the exact commit to the approved deck remote on `main`, which triggers GitHub Pages deployment. An empty-change retry pushes the existing commit. The helper allows 15 minutes for packing and upload; `TRUSTLINK_GIT_PUSH_TIMEOUT_MS` accepts `30000` to `3600000` milliseconds for a different limit.

From the parent workspace, `npm run git:push:pitch-deck` performs the same deck publication. The root `git:commit:push:all` task targets TrustLink Pay instead. A successful push prints links to the actual repository, branch and commit, and refreshes the deck's local `origin/main` tracking ref. A failed push prints the destination without claiming publication; GitHub Pages still requires its separate workflow/site check.

## Safe Editing Rules

- Keep the deck as a simple static `index.html` site.
- Preserve the slide order, navigation, animations, responsive behavior, and typography.
- Keep all assets inline when practical.
- Check that relative paths work from `/TSN-Pitch-Deck/`; do not assume the site is hosted at `/`.
- Avoid absolute local filesystem paths.
- Avoid adding a build system for a simple HTML change.
- Use ASCII for new source text unless the deck already requires a specific Unicode character.
- Do not change the parent TSN repository history or remotes.
- Before committing, inspect `git status` and `git diff` from `pitch-deck/`.
- Do not claim deployment success until the Pages workflow succeeds and the public URL loads.

## Validation Checklist

After editing:

1. Confirm `pitch-deck/index.html` exists.
2. Parse the inline JavaScript with Node, for example by extracting the script and running `node --check`.
3. Check for missing local `src` or `href` references.
4. Serve locally with:

   ```bash
   python -m http.server 8765
   ```

5. Open `http://127.0.0.1:8765/` and verify:
   - The first slide renders.
   - The next and previous buttons work.
   - Dot navigation works.
   - Keyboard navigation works.
   - The live demo and counter animations work.
   - The layout remains usable on mobile widths.
   - The browser console has no JavaScript errors.
6. When publication is explicitly requested, run `npm run push` from `pitch-deck/`.
7. After a successful push, check the GitHub Actions Pages workflow.
8. Verify `https://trustlink-labs.github.io/TSN-Pitch-Deck/` returns HTTP 200 and renders the deck before claiming deployment success.

## Expected Response After Changes

Report briefly:

- What changed in `index.html` or supporting files
- Validation performed
- Commit and deployment status
- Public URL

Remember: this is a presentation deck, not a general TSN application. Make the smallest focused change that satisfies the request.
