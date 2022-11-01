# HTML Rewriter

WASM-based implementation of Cloudflare's HTML Rewriter for use in Node.js. Hard fork of the NPM package [`@worker-tools/html-rewriter`](https://github.com/worker-tools/html-rewriter).

It uses `lol-html` under the hood, the same implementation used by Cloudflare Workers. It is based on [Miniflare's WASM build](https://github.com/mrbbot/html-rewriter-wasm).

## Installation
This package only includes the file-based WASM approach from the `@worker-tools/html-rewriter` package.

`index.ts` loads the WASM that is co-located with this module via the fs/promises API and instantiates the module that way. The approach used in `@worker-tools/html-rewriter` is broken in Node.js version 16 and is one of the primary reasons for the hard fork.

## Usage

```ts
import { 
  HTMLRewriter 
} from '@hoody-network/html-rewriter'

new HTMLRewriter()
  .on("p", {
    element(element) { 
      element.tagName = "h1" 
    },
  })
  .transform(new Response('<p class="red">test</p>'))
  .text().then(x => console.log(x))
```

For more on how to use HTMLRewriter, see the [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/).


## Building

Make sure you've initialized all git submodules. It is 2 levels deep.

```sh
git submodule update --init --recursive
```

Make sure you have `rustup` installed. Then run

```sh
make dist
```

This will build a custom version of `wasm-pack` first, then use it to compile `lol-html` to WASM. Please see the submodules for details on why this is necessary.