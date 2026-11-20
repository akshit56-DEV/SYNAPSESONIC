"use client";
import { useRef, useEffect, useState } from "react";
import { Upload, X, ArrowUpRight, Layers3, AlertCircle } from "lucide-react";
import { makeDeck, samples, type Deck, type Concept } from "./decks";
import ThoughtLine from "./ThoughtLine";
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
  const titleToIndex = new Map<string, number>();
  concepts.forEach((c, i) => titleToIndex.set(c.title.toLowerCase(), i));

  return {
    name,
    nodes: concepts.map((c, i) => {
      let answers = Array.isArray(c.quiz?.answers) ? [...c.quiz.answers] : [];
      let correctIndex = typeof c.quiz?.correctIndex === "number" ? c.quiz.correctIndex : 0;
      if (answers.length < 4) {
        while (answers.length < 4) {
          answers.push(`Option ${String.fromCharCode(65 + answers.length)}`);
        }
      }

      return {
        id: `${name}:${i}`,
        title: c.title,
        summary: c.summary,
        retention: [82, 66, 94, 72, 58, 88][i % 6],
        reviewDay: 0,
        lastReviewed: null,
        needsReview: false,
        quiz: {
          question: c.quiz?.question || `What is the core definition of ${c.title}?`,
          options: answers.slice(0, 4),
          correctIndex: Math.min(Math.max(0, correctIndex), 3),
          explanation: c.quiz?.explanation || `${c.title}: ${c.summary}`,
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
    [isProcessing, setIsProcessing] = useState(false),
    [progressSteps, setProgressSteps] = useState<string[]>([]),
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
    setIsProcessing(true);
    setProgressSteps(["Reading PDF pages"]);
    setError("");

    try {
      const { pdfDeck } = await import("./pdf-deck");
      // Extract text from PDF with live OCR progress callback
      const res = await pdfDeck(file, job.signal, (status) => {
        // Parse "Scanned PDF detected — Running OCR on page X of Y..."
        const match = status.match(/page\s+(\d+)\s+of\s+(\d+)/i);
        const scanStep = match ? `Scanning page ${match[1]} of ${match[2]}` : status;

        setProgressSteps((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].startsWith("Scanning page")) {
            const next = [...prev];
            next[lastIdx] = scanStep;
            return next;
          }
          return [...prev, scanStep];
        });
      });

      if (job.signal.aborted) return;

      // Append Mapping core concepts step
      setProgressSteps((prev) => [...prev, "Mapping core concepts"]);

      const fullText =
        res.rawText && res.rawText.trim().length >= 40
          ? res.rawText
          : res.nodes.map((n) => `${n.title}: ${n.summary}`).join("\n\n");

      const response = await fetch("/api/generate-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fullText,
          title: file.name.replace(/\.pdf$/i, ""),
        }),
        signal: job.signal,
      });

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: "Failed to generate concepts" }));

        // Fallback to client-generated deck if it has at least 3 nodes
        if (res.nodes && res.nodes.length >= 3) {
          setProgressSteps((prev) => [...prev, "Generating recall questions"]);
          setIsProcessing(false);
          await new Promise((r) => setTimeout(r, 600));
          if (!job.signal.aborted) {
            load(res);
            close();
          }
          return;
        }

        throw new Error(err.error || `Request failed: ${response.status}`);
      }

      const data: GroqResponse = await response.json();

      if (!data.concepts || data.concepts.length < 3) {
        if (res.nodes && res.nodes.length >= 3) {
          setProgressSteps((prev) => [...prev, "Generating recall questions"]);
          setIsProcessing(false);
          await new Promise((r) => setTimeout(r, 600));
          if (!job.signal.aborted) {
            load(res);
            close();
          }
          return;
        }
        throw new Error("Not enough concepts generated. Try a different PDF.");
      }

      // Append Generating recall questions step
      setProgressSteps((prev) => [...prev, "Generating recall questions"]);

      const enhancedDeck = convertGroqToDeck(
        file.name.replace(/\.pdf$/i, ""),
        data.concepts,
      );

      // Settle timer cleanly for ~600ms before closing modal and loading deck
      setIsProcessing(false);
      await new Promise((r) => setTimeout(r, 600));

      if (!job.signal.aborted) {
        load(enhancedDeck);
        close();
      }
    } catch (e) {
      if (!job.signal.aborted) {
        setIsProcessing(false);
        setError(
          e instanceof Error && e.name !== "PasswordException"
            ? e.message
            : "Choose an unlocked, text or scanned PDF.",
        );
      }
    } finally {
      controller.current = null;
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
        <button onClick={close} aria-label="Close import" disabled={isProcessing}>
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

      {isProcessing || progressSteps.length > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "24px 20px",
            margin: "21px 0",
            width: "100%",
            minHeight: "140px",
            background: "#1b1e17",
            borderRadius: "9px",
            border: "1px solid #383b32",
            overflowX: "hidden",
          }}
        >
          <ThoughtLine
            working={isProcessing}
            label="Building study deck…"
            doneLabel="Deck ready in"
            steps={progressSteps}
            glyph="sparkle"
            glyphColor="#C6F432"
            color="#F4F4F5"
            fontSize={15}
            breathPeriod={1.6}
            breathDepth={0.45}
            settleDuration={350}
            settleBlur={2}
            collapsible={true}
            collapseOnSettle={false}
            showTimer={true}
          />
        </div>
      ) : (
        <button
          disabled={isProcessing}
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
          <strong>Drop a PDF or browse</strong>
          <small>PDF · up to 20 MB</small>
        </button>
      )}

      {error && (
        <p role="alert" className="error-message">
          <AlertCircle size={14} /> {error}
        </p>
      )}

      {!isProcessing && progressSteps.length === 0 && (
        <>
          <h3>Load Sample Study Deck</h3>
          {["Optical Fiber & Holography", "Neural Networks"].map((name) => (
            <button
              key={name}
              className="sample-deck"
              disabled={isProcessing}
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
