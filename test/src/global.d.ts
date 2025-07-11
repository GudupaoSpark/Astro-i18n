
declare module 'react' {
  const React: any;
  export default React;
}

namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}