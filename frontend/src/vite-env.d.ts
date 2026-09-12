/// <reference types="vite/client" />

// vite.config.ts replaces this expression at build time (see its `define` block), so the value is
// inlined into the bundle and no Node runtime is involved. Declared here rather than pulling in all
// of @types/node for a single property.
declare const process: { env: Record<string, string | undefined> };
