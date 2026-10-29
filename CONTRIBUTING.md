# Contributing

Thanks for helping out! This is a small, dependency-free extension, so getting started is quick.

## Setup

```bash
git clone https://github.com/samma89/webclipper-lite.git
cd webclipper-lite
npm install
npm test
```

To try your changes, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder. After editing code, click the reload icon on the extension card **and refresh the page you're testing on**, since already-open pages keep the old injected scripts.

## Guidelines

- **Keep it light.** No build step, no runtime dependencies. Dev dependencies are for tests only.
- **Keep permissions minimal.** A change that needs a new permission or host access needs a strong justification, and README and PRIVACY.md must be updated with it.
- **Privacy first.** No network calls, analytics, or remote code.
- **Add tests** for extraction or export changes in `test/`. `test/fixtures/article.html` is a handy base page.
- **Page-injected code is special.** `src/extract.js` and `src/picker.js` are injected into pages as classic scripts, so they can't use `import`/`export` and share state through `globalThis.ClipperExtract`. Anything that touches page content must treat it as untrusted.
- Match the surrounding style (see `.editorconfig`).

## Pull requests

1. Open an issue first for anything bigger than a small fix.
2. Branch from `main`, keep the PR focused, and make sure `npm test` passes.
3. Describe what changed and how you tested it in the browser.

## Reporting security issues

Please don't file public issues for vulnerabilities. Use GitHub's private vulnerability reporting on the repository's **Security** tab instead.

## Releasing (maintainers)

1. Bump `version` in both `manifest.json` and `package.json`, and add a section to `CHANGELOG.md`.
2. Run `npm test && npm run package`.
3. Upload `dist/webclipper-lite-v<version>.zip` in the Chrome Web Store developer dashboard.
4. Tag the release (`git tag v<version>`) and push the tag.
