import { makeDeck, type Deck } from "./decks";

function concepts(text: string): string[][] {
  const seen = new Set<string>();
  const pairs: string[][] = [];

  for (const line of text
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\n(?=\p{Ll})/gu, " ")
    .split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = line.replace(/\s+/g, " ").trim();
    if (sentence.length < 18 || sentence.length > 500) continue;
    const match = sentence.match(
      /^(.{2,70}?)(?:\s*[:–—]\s*|\s+(?:is|are|means|refers to|describes)\s+)(.{10,})$/i,
    );
    const title = (
      match?.[1] ?? sentence.split(" ").slice(0, 3).join(" ")
    ).trim();
    const summary = (match?.[2] ?? sentence.slice(title.length))
      .replace(/^[\s,:;-]+/, "")
      .trim();
    if (!summary || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    pairs.push([title, summary]);
    if (pairs.length === 15) break;
  }

  // Fallback: if regular definitions weren't matched but there is substantive text
  if (pairs.length < 3 && text.trim().length >= 80) {
    const chunks = text
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length >= 25 && s.length <= 400);

    for (const chunk of chunks) {
      if (pairs.length >= 15) break;
      const words = chunk.split(" ");
      const title = words.slice(0, Math.min(4, words.length)).join(" ").replace(/[^\w\s-]/g, "").trim();
      if (title.length >= 3 && !seen.has(title.toLowerCase())) {
        seen.add(title.toLowerCase());
        pairs.push([title, chunk]);
      }
    }
  }

  return pairs;
}

export interface ExtractedPdfDeck extends Deck {
  rawText: string;
  isOcr: boolean;
  deck: Deck;
}

export async function pdfDeck(
  file: File,
  signal: AbortSignal,
  onStatus?: (status: string) => void
): Promise<ExtractedPdfDeck> {
  if (file.size > 20 * 1024 * 1024) throw Error("Choose a PDF under 20 MB.");
  if (!(await file.slice(0, 1024).text()).includes("%PDF-"))
    throw Error("Choose a valid PDF document.");

  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const bytes = await file.arrayBuffer();
  signal.throwIfAborted();

  const task = pdf.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  } as Parameters<typeof pdf.getDocument>[0]);

  const cancel = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", cancel, { once: true });

  try {
    const doc = await task.promise;
    let text = "";
    let isOcr = false;
    const numPages = doc.numPages;

    // Phase 1: Try normal text extraction across pages (up to 50)
    for (let i = 1; i <= Math.min(50, numPages); i++) {
      signal.throwIfAborted();
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("") + "\n";
      page.cleanup();
      if (concepts(text).length >= 15 || text.length > 200000) break;
    }

    // Phase 2: If extracted text is under 150 characters, automatically run client-side OCR
    if (text.trim().length < 150) {
      isOcr = true;
      const ocrPages = Math.min(6, numPages);
      let ocrAccumulated = "";

      const Tesseract = await import("tesseract.js");

      for (let p = 1; p <= ocrPages; p++) {
        signal.throwIfAborted();
        const statusMsg = `Scanned PDF detected — Running OCR on page ${p} of ${ocrPages}...`;
        onStatus?.(statusMsg);

        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");

        if (ctx) {
          const renderTask = page.render({
            canvas,
            canvasContext: ctx,
            viewport,
          } as any);
          await renderTask.promise;
          signal.throwIfAborted();

          const result = await Tesseract.recognize(canvas, "eng");
          signal.throwIfAborted();
          const recognized = result?.data?.text || "";
          ocrAccumulated += recognized + "\n\n";
        }
        page.cleanup();
      }

      if (ocrAccumulated.trim().length >= 40) {
        text = ocrAccumulated;
      }
    }

    const pairs = concepts(text);
    if (pairs.length < 3 && text.trim().length < 40) {
      throw Error(
        "Not enough readable text. Choose a text or clear scanned PDF with educational content.",
      );
    }

    const deck = makeDeck(file.name.replace(/\.pdf$/i, ""), pairs.slice(0, 15));
    return {
      ...deck,
      deck,
      rawText: text,
      isOcr,
    };
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!signal.aborted) await task.destroy();
  }
}
