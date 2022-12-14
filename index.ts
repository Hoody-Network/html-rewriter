import * as fspromis from 'fs/promises';

import type {
  HTMLRewriter as BaseHTMLRewriter,
  ContentTypeOptions,
  Element,
  EndTag,
  Comment,
  TextChunk,
  Doctype,
  DocumentEnd,
  ElementHandlers,
  DocumentHandlers,
} from "./vendor/html_rewriter";
import * as _base from './vendor/html_rewriter.js';

import {
  Transform
} from "stream"

// @ts-ignore
const { default: initWASM } = _base;
const base = _base;

export type { 
  ContentTypeOptions,
  Element,
  EndTag,
  Comment,
  TextChunk,
  Doctype,
  DocumentEnd,
  ElementHandlers,
  DocumentHandlers,
}

type SelectorElementHandlers = [selector: string, handlers: ElementHandlers];

type TransformLegacyOptions = {
  flushTimeout?: number
};

const DEFAULT_FLUSH_TIMEOUT = 1000

const kEnableEsiTags = Symbol("kEnableEsiTags");

// In case a server doesn't return the proper mime type (e.g. githubusercontent.com)..
const toWASMResponse = (response: Response) => {
  if (response.headers.get('content-type')?.startsWith('application/wasm')) return response;
  const { body, headers: hs, ...props } = response
  const headers = new Headers(hs)
  headers.set('content-type', 'application/wasm')
  return new Response(body, { ...props, headers })
}

let resolveInitialized: () => void;
const initialized = new Promise<void>((resolve) => {
  resolveInitialized = resolve
});
let executing = false, settled = false;

export class HTMLRewriter {
  readonly elementHandlers: SelectorElementHandlers[] = [];
  readonly documentHandlers: DocumentHandlers[] = [];
  [kEnableEsiTags] = false;

  constructor() {
    if (!settled && !executing) {
      executing = true;

      fspromis.readFile(new URL("./vendor/html_rewriter_bg.wasm", import.meta.url))
        .then((b) => new Response(b))
        .then(toWASMResponse)
        .then(initWASM)
        .then(resolveInitialized)
        .catch(err => { 
          executing = false; 
          console.error(err);
        })
    }
  }

  on(selector: string, handlers: ElementHandlers): this {
    this.elementHandlers.push([selector, handlers]);
    return this;
  }

  onDocument(handlers: DocumentHandlers): this {
    this.documentHandlers.push(handlers);
    return this;
  }

  transform(response: Response): Response {
    const body = response.body as ReadableStream<Uint8Array> | null;
    // HTMLRewriter doesn't run the end handler if the body is null, so it's
    // pointless to setup the transform stream.
    if (body === null) return new Response(body, response);

    if (response instanceof Response) {
      // Make sure we validate chunks are BufferSources and convert them to
      // Uint8Arrays as required by the Rust glue code.
      response = new Response(response.body, response);
    }

    let rewriter: BaseHTMLRewriter;
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      start: async (controller) => {
        // Create a rewriter instance for this transformation that writes its
        // output to the transformed response's stream. Note that each
        // BaseHTMLRewriter can only be used once. 
        await initialized;
        rewriter = new base.HTMLRewriter(
          (output) => {
            // enqueue will throw on empty chunks
            if (output.length !== 0) controller.enqueue(output);
          },
          { enableEsiTags: this[kEnableEsiTags] }
        );
        // Add all registered handlers
        for (const [selector, handlers] of this.elementHandlers) {
          rewriter.on(selector, handlers);
        }
        for (const handlers of this.documentHandlers) {
          rewriter.onDocument(handlers);
        }
      },
      // The finally() below will ensure the rewriter is always freed.
      // chunk is guaranteed to be a Uint8Array as we're using the
      // @miniflare/core Response class, which transforms to a byte stream.
      transform: (chunk) => rewriter.write(chunk),
      flush: () => rewriter.end(),
    });
    const promise = body.pipeTo(transformStream.writable);
    promise.catch(() => {}).finally(() => rewriter?.free());

    // Return a response with the transformed body, copying over headers, etc
    const res = new Response(transformStream.readable, response);
    // If Content-Length is set, it's probably going to be wrong, since we're
    // rewriting content, so remove it
    res.headers.delete("Content-Length");
    return res;
  }

  pipeThrough({ 
    readable,
    writable
  }: {
    readable: ReadableStream<Uint8Array>, 
    writable: WritableStream<Uint8Array> 
  }): ReadableStream<Uint8Array> {
    let rewriter: BaseHTMLRewriter;
    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      start: async (controller) => {
        // Create a rewriter instance for this transformation that writes its
        // output to the transformed response's stream. Note that each
        // BaseHTMLRewriter can only be used once. 
        await initialized;
        rewriter = new base.HTMLRewriter(
          (output) => {
            // enqueue will throw on empty chunks
            if (output.length !== 0) controller.enqueue(output);
          },
          { enableEsiTags: this[kEnableEsiTags] }
        );
        // Add all registered handlers
        for (const [selector, handlers] of this.elementHandlers) {
          rewriter.on(selector, handlers);
        }
        for (const handlers of this.documentHandlers) {
          rewriter.onDocument(handlers);
        }
      },
      // The finally() below will ensure the rewriter is always freed.
      // chunk is guaranteed to be a Uint8Array as we're using the
      // @miniflare/core Response class, which transforms to a byte stream.
      transform: (chunk) => rewriter.write(chunk),
      flush: () => rewriter.end(),
    });
    const promise = readable.pipeTo(transformStream.writable);
    promise.catch(() => {}).finally(() => rewriter?.free());

    if (writable) {
      transformStream.readable.pipeTo(writable)
    }

    return transformStream.readable;
  }

  transformLegacy(nextStream: Transform, options?: TransformLegacyOptions) : Transform {
    if (!options) {
      options = {}
    }

    if (
      typeof options.flushTimeout !== 'number' ||
      isNaN(options.flushTimeout)
    ) {
      options.flushTimeout = DEFAULT_FLUSH_TIMEOUT
    }

    let rewriter: BaseHTMLRewriter;
    let endCb: (() => void) | null | undefined = null;
    let endTimeout: NodeJS.Timeout | undefined;
    let pendingChunks = 0;
    let stream = new Transform({
      construct: async (cb) => {
        // Create a rewriter instance for this transformation that writes its
        // output to the transformed response's stream. Note that each
        // BaseHTMLRewriter can only be used once. 
        try {
          await initialized;
          rewriter = new base.HTMLRewriter(
            (output) => {
              stream.push(output);
              pendingChunks--;

              if (endCb && pendingChunks === 0) {
                endCb()
                clearTimeout(endTimeout)
                endCb = null
                endTimeout = undefined
              }
            },
            { enableEsiTags: this[kEnableEsiTags] }
          );
          // Add all registered handlers
          for (const [selector, handlers] of this.elementHandlers) {
            rewriter.on(selector, handlers);
          }
          for (const handlers of this.documentHandlers) {
            rewriter.onDocument(handlers);
          }
        } catch (e: any) {
          cb(e);
          return;
        }

        cb();
      },
      transform: async (chunk, _, cb) => {
        try {
          if (!(chunk instanceof Buffer)) {
            chunk = Buffer.from(chunk);
          }

          pendingChunks++;
          await rewriter.write(chunk);
        } catch (e: any) {
          cb(e);
          return;
        }

        cb();
      },
      flush: async (cb) => {
        try {
          await rewriter.end();
          rewriter?.free();
        } catch (e: any) {
          cb(e);
          return;
        }

        if (pendingChunks === 0) {
          cb();
        } else {
          endCb = cb;
          endTimeout = setTimeout(() => {
            if (endCb) {
              endCb();
            }

            endTimeout = undefined;
          }, options?.flushTimeout)
        }
      }
    });

    if (nextStream && nextStream instanceof Transform) {
      return stream.pipe(nextStream)
    }

    return stream
  }
}

export function withEnableEsiTags(rewriter: HTMLRewriter): HTMLRewriter {
  rewriter[kEnableEsiTags] = true;
  return rewriter;
}
