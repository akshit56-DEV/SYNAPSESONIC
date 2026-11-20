"use client";
import { useRef, useEffect, useState } from "react";
import { Upload, X, ArrowUpRight, Layers3, Loader2, AlertCircle } from "lucide-react";
import { makeDeck, samples, type Deck, type Concept } from "./decks";
import "./import.css";

interface GroqConcept {
  title: string;
  summary: string;
  links: string[];
  quiz: {
    question: string;
    answers: string[];
    correctIndex: number;
    explanation: string;
  };
}

interface GroqResponse {
  concepts: GroqConcept[];
}

function convertGroqToDeck(name: string, concepts: GroqConcept[]): Deck {
  // Create a map of title to index for linking
  const titleToIndex = new Map<string, number>();
  concepts.forEach((c, i) => titleToIndex.set(c.title.toLowerCase(), i));

  return {
    name,
    nodes: concepts.map((c, i) => {
      const correctIndex = (i * 3 + 1) % 4;
      const options = [1, 2, 3].map(k => concepts[(i + k) % concepts.length].title);
      options.splice(correctIndex, 0, c.title);

      return {
        id: `${name}:${i}`,
        title: c.title,
        summary: c.summary,
        retention: [82, 66, 94, 72, 58, 88][i % 6],
        reviewDay: 0,
        lastReviewed: null,
        needsReview: false,
        quiz: {
          question: c.quiz.question,
          options: c.quiz.answers,
          correctIndex: c.quiz.correctIndex,
          explanation: c.quiz.explanation,
        },
      } as Concept;
    }),
  };
}

export function DeckImport({
  load,
  close,
}: {
  load: (d: Deck) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState<"idle" | "extracting" | "generating" | "done">("idle"),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => {
      d.close();
      controller.current?.abort();
    };
  }, []);
  async function read(file?: File) {
    if (!file || controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true);
    setError("");
    setStage("extracting");
    try {
      const { pdfDeck } = await import("./pdf-deck");
      // First extract text from PDF
      const deck = await pdfDeck(file, job.signal);
      if (job.signal.aborted) return;

      // Now send the extracted text to Groq API for enhanced concept generation
      setStage("generating");
      const fullText = deck.nodes.map(n => `${n.title}: ${n.summary}`).join("\n\n");
      
      const response = await fetch("/api/generate-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText, title: file.name.replace(/\.pdf$/i, "") }),
        signal: job.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Failed to generate concepts" }));
        throw new Error(err.error || `Request failed: ${response.status}`);
      }

      const data: GroqResponse = await response.json();
      
      if (!data.concepts || data.concepts.length < 4) {
        throw new Error("Not enough concepts generated. Try a different PDF.");
      }

      const enhancedDeck = convertGroqToDeck(file.name.replace(/\.pdf$/i, ""), data.concepts);
      
      if (!job.signal.aborted) {
        load(enhancedDeck);
        close();
      }
    } catch (e) {
      if (!job.signal.aborted)
        setError(
          e instanceof Error && e.name !== "PasswordException"
            ? e.message
            : "Choose an unlocked, text-based PDF.",
        );
    } finally {
      controller.current = null;
      if (!job.signal.aborted) {
        setBusy(false);
        setStage("idle");
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="import-dialog glass"
      aria-labelledby="import-title"
      onCancel={close}
    >
      <div className="import-head">
        <span className="eyebrow">STUDY LIBRARY / IMPORT</span>
          <button onClick={close} aria-label="Close import" disabled={busy}>
          <X size={16} />
        </button>
      </div>
      <h2 id="import-title">Import a study deck</h2>
      <p>Turn definitions in your PDF into a field of recall nodes.</p>
      <input
        ref={input}
        type="file"
        hidden
        accept="application/pdf,.pdf"
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        disabled={busy}
        className={"dropzone " + (drag ? "drag" : "")}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void read(e.dataTransfer.files[0]);
        }}
      >
        <Upload size={23} />
        <strong>
            {stage === "extracting" ? "Extracting text from PDF…" :
             stage === "generating" ? "Generating concepts with AI…" :
             "Drop a PDF or browse files"}
        </strong>
          <small>
            {stage === "extracting" ? "Reading PDF pages…" :
             stage === "generating" ? "Calling Groq (openai/gpt-oss-20b)…" :
             "Text-based PDF · up to 20 MB · processed on device"}
          </small>
          {(stage === "extracting" || stage === "generating") && (
            <Loader2 size={20} className="spin" />
          )}
      </button>
        {error && (
          <p role="alert" className="error-message">
            <AlertCircle size={14} /> {error}
          </p>
        )}
        {stage === "idle" && (
          <>
            <h3>Load Sample Study Deck</h3>
            {["Optical Fiber & Holography", "Neural Networks"].map((name) => (
              <button
                key={name}
                className="sample-deck"
                disabled={busy}
                onClick={() => {
                  load(makeDeck(name, samples[name]));
                  close();
                }}
              >
                <Layers3 size={16} />
                {name}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </>
        )}
    </dialog>
  );
}
