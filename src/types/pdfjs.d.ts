declare module "pdfjs-dist/build/pdf.mjs" {
  export const version: string;
  export const GlobalWorkerOptions: {
    workerSrc: string;
    workerPort: any;
  };
  export function getDocument(src: any): {
    promise: Promise<any>;
  };
}
