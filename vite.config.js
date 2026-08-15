import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';

/**
 * Bundles the game into a single self-contained index.html, then emits a
 * service worker that precaches whatever is left.
 *
 * Both steps live in one plugin so their order is guaranteed: the precache
 * manifest has to be built *after* inlining, or it would list JS and CSS files
 * that no longer exist.
 *
 * Nothing here hardcodes a deployment path. Combined with `base: './'` and the
 * relative `start_url`/`scope` in the manifest, the same output runs from a
 * GitHub Pages project subfolder, a user site, or a local file.
 */
const lazyChunks = /^voice-[A-Za-z0-9_-]+\.js$/;

function selfContainedPWA({ swSource = 'src/sw.js', publicFiles = [] } = {}) {
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return {
    name: 'mermaid-mall-self-contained',
    apply: 'build',
    enforce: 'post',

    // `enforce: 'post'` orders the *plugin*, which is not enough on its own:
    // Vite resolves the `__VITE_PRELOAD__` marker left behind by dynamic imports
    // in its own generateBundle, and inlining the entry before that happens
    // freezes the placeholder into the HTML, where it throws a ReferenceError
    // the moment the neural voice is switched on. `order: 'post'` on the hook
    // itself is what actually puts this last.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];

        /* ---------------------------------------------- inline JS and CSS -- */
        if (html) {
          let source = html.source;

          for (const [name, asset] of Object.entries(bundle)) {
            const file = escapeRe(name.split('/').pop());
            // Replacements go through a function: the bundle is full of `$&` and
            // `$'` sequences that String.replace would otherwise interpret.
            if (name.endsWith('.css')) {
              source = source.replace(
                new RegExp(`<link[^>]*href="[^"]*${file}"[^>]*>`),
                () => `<style>${asset.source}</style>`,
              );
              delete bundle[name];
            } else if (name.endsWith('.js')) {
              const before = source;
              source = source.replace(
                new RegExp(`<script[^>]*src="[^"]*${file}"[^>]*></script>`),
                () => `<script type="module">${chunkCode(asset)}</script>`,
              );
              // Only the entry has a script tag. Lazily-imported chunks (the
              // neural voice) have to survive as real files, so a chunk is only
              // dropped once it has actually been folded into the HTML.
              if (source !== before) delete bundle[name];
            }
          }
          html.source = source;
        }

        /* ------------------------------------------- emit service worker --- */
        // The neural voice and everything it drags in — chiefly a 21 MB ONNX
        // runtime — stay out. It is opt-in and only useful alongside a ~92 MB
        // model download, so making every install pay for it up front would be
        // backwards. The worker's stale-while-revalidate rule picks these up the
        // first time somebody actually switches the voice on.
        const deferred = new Set();
        for (const [name, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk' || !lazyChunks.test(name)) continue;
          deferred.add(name);
          for (const asset of chunk.viteMetadata?.importedAssets ?? []) deferred.add(asset);
        }

        const remaining = Object.keys(bundle).filter((f) => f !== 'sw.js' && !deferred.has(f));
        // '' and 'index.html' are the same resource but both get requested, so
        // both are cached; the Set stops index.html being listed twice.
        const precache = [...new Set(['', 'index.html', ...remaining, ...publicFiles])];
        const version = `mermaid-mall-${createHash('sha1')
          .update(precache.join('|') + (html?.source.length ?? 0))
          .digest('hex')
          .slice(0, 8)}`;

        // replaceAll, not replace: the tokens are also named in the worker's own
        // doc comment, which would otherwise swallow the substitution.
        const source = readFileSync(swSource, 'utf8')
          .replaceAll('__PRECACHE__', JSON.stringify(precache))
          .replaceAll('__VERSION__', version);

        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      },
    },
  };
}

const chunkCode = (asset) => (asset.type === 'chunk' ? asset.code : asset.source);

// Everything in public/ is copied verbatim and keeps a stable name, so the
// precache list can simply enumerate it.
const publicFiles = readdirSync('public', { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => {
    const dir = e.parentPath.replace(/^public\/?/, '');
    return dir ? `${dir}/${e.name}` : e.name;
  });

export default defineConfig({
  base: './',
  plugins: [selfContainedPWA({ publicFiles })],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // The static graph stays in one chunk, so there is a single script tag
        // to inline. Only the neural voice splits out, via its dynamic import.
        // Chunks land at the output root rather than assets/: the entry ends up
        // inlined in index.html, so its dynamic imports resolve against the
        // document, and ./assets/voice-x.js would only be right from inside
        // assets/.
        chunkFileNames: 'voice-[hash].js',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
