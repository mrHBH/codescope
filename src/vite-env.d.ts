/// <reference types="vite/client" />

declare module '*.html?raw' {
  const src: string;
  export default src;
}

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}
