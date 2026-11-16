import QRCode from "qrcode";
import PDFDocument from "pdfkit";

/**
 * FR-16: printable QR codes. PNG uses error correction level M with a quiet
 * zone; PDF is A6 and includes the restaurant name and table number.
 */
export async function renderPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 640,
  });
}

export async function renderPdf(
  url: string,
  restaurantName: string,
  tableNumber: string
): Promise<Buffer> {
  const png = await renderPng(url);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A6", margin: 28 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(restaurantName, { align: "center" });
    doc.moveDown(0.25);
    doc.fontSize(22).text(`Table ${tableNumber}`, { align: "center" });
    doc.moveDown(0.5);

    const width = doc.page.width - 56;
    doc.image(png, 28, doc.y, { width, align: "center" });
    doc.moveDown(0.5);

    doc.fontSize(10).text("Scan to view the menu and order", { align: "center" });
    doc.end();
  });
}
