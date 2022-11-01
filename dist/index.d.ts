/// <reference types="node" />
import type { ContentTypeOptions, Element, EndTag, Comment, TextChunk, Doctype, DocumentEnd, ElementHandlers, DocumentHandlers } from "./vendor/html_rewriter";
import { Transform } from "stream";
export type { ContentTypeOptions, Element, EndTag, Comment, TextChunk, Doctype, DocumentEnd, ElementHandlers, DocumentHandlers, };
declare type SelectorElementHandlers = [selector: string, handlers: ElementHandlers];
declare const kEnableEsiTags: unique symbol;
export declare class HTMLRewriter {
    readonly elementHandlers: SelectorElementHandlers[];
    readonly documentHandlers: DocumentHandlers[];
    [kEnableEsiTags]: boolean;
    constructor();
    on(selector: string, handlers: ElementHandlers): this;
    onDocument(handlers: DocumentHandlers): this;
    transform(response: Response): Response;
    pipeThrough({ readable, writable }: {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
    }): ReadableStream<Uint8Array>;
    transformLegacy(params: Transform): Transform;
}
export declare function withEnableEsiTags(rewriter: HTMLRewriter): HTMLRewriter;
