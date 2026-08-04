# darwinian-minds docs

Docusaurus 3 site for [darwinian-minds](https://github.com/remyjkim/darwinian-worker). Published at https://docs.darwinian.dev.

## Local development

```bash
cd docs-docusaurus
bun install
bun run start
```

Opens at http://localhost:3000.

## Build

```bash
bun run build
```

Outputs to `./build`. Strict link checking is enabled; the build fails on broken internal links, broken anchors, or broken markdown links.

## Deploy

```bash
bun run deploy:pages
```

Deploys `./build` to the Cloudflare Pages project `darwiniantools-docs`. The custom domain `docs.darwinian.dev` is configured in the Cloudflare dashboard.

## TODO

- Replace placeholder branding assets in `static/img/` with designed favicon, logo, and social card
- Fill out stub pages; the IA is scaffolded but most pages currently say "Coming soon"
- Add a CI job that runs `bun run build` on PRs touching `docs-docusaurus/`
