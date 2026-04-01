declare module "pdf-parse" {
  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
    fingerprint: string;
  }
  function pdf(data: Buffer | string, options?: any): Promise<PDFInfo>;
  export = pdf;
}
