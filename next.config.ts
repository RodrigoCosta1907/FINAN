import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // pdfjs usa worker/canvas em Node — não empacotar no bundle
  serverExternalPackages: ["pdfjs-dist"],
  // garante que o worker vá junto na função serverless (import dinâmico interno)
  outputFileTracingIncludes: {
    "/importar": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
