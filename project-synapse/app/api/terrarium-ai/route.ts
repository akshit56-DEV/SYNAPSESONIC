import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }
  return new Groq({ apiKey });
}

export function cleanMathText(str: string): string {
  if (!str || typeof str !== "string") return "";
  let s = str
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\\$/g, "")
    .replace(/\$/g, "");

  const replacements: [RegExp, string][] = [
    [/\\alpha\b/gi, "α"],
    [/\\beta\b/gi, "β"],
    [/\\gamma\b/gi, "γ"],
    [/\\theta\b/gi, "θ"],
    [/\\lambda\b/gi, "λ"],
    [/\\mu\b/gi, "μ"],
    [/\\sigma\b/gi, "σ"],
    [/\\nabla\b/gi, "∇"],
    [/\\delta\b/gi, "Δ"],
    [/\\partial\b/gi, "∂"],
    [/\\le(q)?\b/gi, "≤"],
    [/\\ge(q)?\b/gi, "≥"],
    [/\\times\b/gi, "×"],
    [/\\approx\b/gi, "≈"],
    [/\\neq\b/gi, "≠"],
    [/\\to\b/gi, "→"],
    [/\\in\b/gi, "∈"],
    [/\\infty\b/gi, "∞"],
    [/\\sqrt\{([^}]+)\}/gi, "√($1)"],
    [/\\frac\{([^}]+)\}\{([^}]+)\}/gi, "($1)/($2)"],
    [/\\cdot\b/gi, "·"],
    [/\\pm\b/gi, "±"],
  ];

  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }

  // Remove any remaining stray backslashes followed by alphanumeric or symbol
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");

  return s.trim();
}

function sanitizeJsonString(raw: string): string {
  let cleaned = raw.trim();
  // Strip reasoning model thinking tags before extracting JSON
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function parseJsonSafe(raw: string): any {
  const cleaned = sanitizeJsonString(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Escape unescaped backslashes not part of valid JSON escapes
    const fixed = cleaned.replace(
      /\\([^"\\\/bfnrtu]|u(?![\da-fA-F]{4}))/g,
      "\\\\$1"
    );
    try {
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

// Exact working Groq model used across micu-chat and generate-graph
const WORKING_GROQ_MODEL = "openai/gpt-oss-20b";

async function callGroqWithRetry(
  groq: Groq,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1200
): Promise<any> {
  // Attempt 1: primary attempt using response_format json_object
  try {
    const res = await groq.chat.completions.create({
      model: WORKING_GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: maxTokens,
    });
    const content = res.choices[0]?.message?.content || "";
    if (content) {
      const parsed = parseJsonSafe(content);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (err: any) {
    // Tolerant retry: if response_format triggers 400 json_validate_failed or fails,
    // log with console.warn and fall through to Attempt 2
    console.warn(
      "[terrarium-ai] Attempt 1 with response_format failed, retrying without response_format:",
      err?.message || err
    );
  }

  // Attempt 2: fallback retry with SAME working model without response_format
  try {
    const retryUser = `${userPrompt}\n\nCRITICAL INSTRUCTION: Output pure, valid raw JSON only. Do not wrap in markdown code blocks or conversational commentary. Never use LaTeX syntax or backslashes.`;
    const fallbackRes = await groq.chat.completions.create({
      model: WORKING_GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: `${systemPrompt} Output raw valid JSON only. Never use LaTeX backslashes. Never write multi-step arithmetic calculations.`,
        },
        { role: "user", content: retryUser },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    });
    const fallbackContent = fallbackRes.choices[0]?.message?.content || "";
    if (fallbackContent) {
      const parsed = parseJsonSafe(fallbackContent);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (err: any) {
    console.warn(
      "[terrarium-ai] Attempt 2 without response_format failed:",
      err?.message || err
    );
  }

  return null;
}

const HUMAN_ERROR = "AI synthesis hit a snag. Tap Retry to try again.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const { mode } = body;
    if (mode !== "bridge" && mode !== "expand" && mode !== "quiz") {
      return NextResponse.json(
        { error: "Invalid 'mode'. Must be 'bridge', 'expand', or 'quiz'" },
        { status: 400 }
      );
    }

    let groq: Groq;
    try {
      groq = getGroqClient();
    } catch {
      return NextResponse.json(
        { error: HUMAN_ERROR },
        { status: 500 }
      );
    }

    // ── Mode 1: Bridge / Synapse Fusion ──────────────────────────────────────
    if (mode === "bridge") {
      const { conceptA, conceptB, deckTitle } = body;
      if (
        !conceptA?.title ||
        !conceptA?.summary ||
        !conceptB?.title ||
        !conceptB?.summary
      ) {
        return NextResponse.json(
          {
            error:
              "Both 'conceptA' and 'conceptB' must contain 'title' and 'summary'",
          },
          { status: 400 }
        );
      }

      const prompt = `You are an expert cognitive scientist and technical educator analyzing deep connections between concepts${
        deckTitle ? ` in the subject '${deckTitle}'` : ""
      }.

Analyze the deep structural, causal, mathematical, or mechanistic link between these two concepts:
Concept A: "${conceptA.title}" - ${conceptA.summary}
Concept B: "${conceptB.title}" - ${conceptB.summary}

Synthesize how they truly interact, cause, limit, or contrast with each other at an exam-grade level.
CRITICAL PEDAGOGICAL INSTRUCTION:
- Focus on conceptual, causal, physical-intuition, and comparative reasoning questions.
- NEVER invent multi-step trigonometric or arithmetic calculation problems whose numerical options might be miscalculated.
- NEVER use LaTeX syntax, dollar signs ($), or backslashes (\\theta, \\lambda, \\alpha, \\frac). Always write clean plain Unicode symbols like θ, α, λ, ≤, ≥, ×, ², ∇.

Return ONLY a valid JSON object matching this schema:
{
  "relationshipLabel": "2-4 word label (e.g. 'Stability Bottleneck', 'Dual Wave Mechanics', 'Gradient Constraint')",
  "connectionSummary": "2 crisp, insightful sentences explaining how A and B connect.",
  "examTrap": "1 concise sentence describing a common exam misconception linking A and B.",
  "question": "1 challenging cross-concept multiple-choice question testing BOTH concepts together conceptually.",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "1-2 sentences explaining why the correct answer connects A and B."
}`;

      const parsed = await callGroqWithRetry(
        groq,
        "You are a rigorous technical educator. Respond strictly with a JSON object. Focus on conceptual reasoning without numerical calculations. Never use LaTeX backslashes.",
        prompt,
        1200
      );

      if (
        !parsed ||
        !parsed.relationshipLabel ||
        !parsed.connectionSummary ||
        !parsed.examTrap ||
        !parsed.question ||
        !Array.isArray(parsed.options) ||
        parsed.options.length < 4 ||
        typeof parsed.correctIndex !== "number" ||
        !parsed.explanation
      ) {
        return NextResponse.json(
          { error: HUMAN_ERROR },
          { status: 500 }
        );
      }

      const validOptions = parsed.options.slice(0, 4);
      while (validOptions.length < 4) {
        validOptions.push(
          `Option ${String.fromCharCode(65 + validOptions.length)}`
        );
      }
      const safeCorrectIndex = Math.max(
        0,
        Math.min(3, Math.floor(parsed.correctIndex))
      );

      return NextResponse.json({
        relationshipLabel: cleanMathText(String(parsed.relationshipLabel)),
        connectionSummary: cleanMathText(String(parsed.connectionSummary)),
        examTrap: cleanMathText(String(parsed.examTrap)),
        question: cleanMathText(String(parsed.question)),
        options: validOptions.map((o: any) => cleanMathText(String(o))),
        correctIndex: safeCorrectIndex,
        explanation: cleanMathText(String(parsed.explanation)),
      });
    }

    // ── Mode 2: Expand / Deep Branching ──────────────────────────────────────
    if (mode === "expand") {
      const { parentConcept, existingTitles = [], deckTitle } = body;
      if (!parentConcept?.title || !parentConcept?.summary) {
        return NextResponse.json(
          {
            error: "'parentConcept' must contain 'title' and 'summary'",
          },
          { status: 400 }
        );
      }

      const existingLower = (
        Array.isArray(existingTitles) ? existingTitles : []
      ).map((t: string) => String(t).toLowerCase().trim());

      const existingStr =
        existingTitles.length > 0
          ? `Existing concepts already in this deck (DO NOT duplicate or closely rename any of these): ${existingTitles.join(
              ", "
            )}.`
          : "";

      const prompt = `You are a curriculum architect and technical expert.
A student is exploring the concept:
Parent Concept: "${parentConcept.title}"
Summary: ${parentConcept.summary}
${deckTitle ? `Course Subject: "${deckTitle}"` : ""}
${existingStr}

Generate 2 or 3 distinct, deeper sub-concepts that branch directly off "${parentConcept.title}" into deeper technical mechanisms, sub-modules, or specific variations.
DO NOT duplicate any existing titles.
CRITICAL PEDAGOGICAL INSTRUCTION:
- Focus on conceptual, causal, physical-intuition, and comparative reasoning questions.
- NEVER invent multi-step trigonometric or arithmetic calculation problems whose numerical options might be miscalculated.
- NEVER use LaTeX syntax, dollar signs ($), or backslashes (\\theta, \\lambda, \\alpha, \\frac). Always write clean plain Unicode symbols like θ, α, λ, ≤, ≥, ×, ², ∇.

Return ONLY a valid JSON object matching this schema:
{
  "subconcepts": [
    {
      "title": "Concise sub-concept title (max 50 chars)",
      "summary": "2 clear sentences explaining this sub-concept.",
      "question": "1 crisp conceptual recall MCQ for this sub-concept.",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "1 concise explanation sentence."
    }
  ]
}`;

      const parsed = await callGroqWithRetry(
        groq,
        "You are a rigorous technical curriculum architect. Respond strictly with a JSON object. Focus on conceptual mechanism questions without calculations. Never use LaTeX backslashes.",
        prompt,
        1500
      );

      if (
        !parsed ||
        !Array.isArray(parsed.subconcepts) ||
        parsed.subconcepts.length < 1
      ) {
        return NextResponse.json(
          { error: HUMAN_ERROR },
          { status: 500 }
        );
      }

      const validSubconcepts: any[] = [];
      for (const sc of parsed.subconcepts) {
        const t = cleanMathText(String(sc.title || ""));
        if (!t) continue;
        if (existingLower.includes(t.toLowerCase())) continue;

        let opts = Array.isArray(sc.quiz?.answers || sc.options)
          ? [...(sc.quiz?.answers || sc.options)]
          : [];
        while (opts.length < 4) {
          opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
        }
        const safeIdx = Math.max(
          0,
          Math.min(
            3,
            Math.floor(sc.quiz?.correctIndex ?? sc.correctIndex ?? 0)
          )
        );

        validSubconcepts.push({
          title: t,
          summary: cleanMathText(String(sc.summary || "")),
          question: cleanMathText(
            String(
              sc.quiz?.question ||
                sc.question ||
                `What is the core principle of ${t}?`
            )
          ),
          options: opts
            .slice(0, 4)
            .map((o: any) => cleanMathText(String(o))),
          correctIndex: safeIdx,
          explanation: cleanMathText(
            String(
              sc.quiz?.explanation ||
                sc.explanation ||
                `${t}: ${sc.summary}`
            )
          ),
        });
      }

      if (validSubconcepts.length === 0) {
        validSubconcepts.push({
          title: `${cleanMathText(parentConcept.title)} Mechanism`,
          summary: `A deeper technical mechanism underlying ${cleanMathText(parentConcept.title)}.`,
          question: `How does the mechanism of ${cleanMathText(parentConcept.title)} operate?`,
          options: [
            `Direct causal propagation`,
            `Stochastic sampling`,
            `Inverse thresholding`,
            `Static buffering`,
          ],
          correctIndex: 0,
          explanation: `The mechanism operates through direct causal propagation.`,
        });
      }

      return NextResponse.json({
        subconcepts: validSubconcepts.slice(0, 3),
      });
    }

    // ── Mode 3: Dynamic Infinite Recall Quiz ─────────────────────────────────
    if (mode === "quiz") {
      const { concept, previousQuestions = [], deckTitle } = body;
      if (!concept?.title || !concept?.summary) {
        return NextResponse.json(
          { error: "'concept' must contain 'title' and 'summary'" },
          { status: 400 }
        );
      }

      const prevQStr =
        Array.isArray(previousQuestions) && previousQuestions.length > 0
          ? `Questions already asked previously for this concept (DO NOT repeat or closely mirror these): ${previousQuestions
              .slice(-5)
              .map((q: string) => `"${q}"`)
              .join("; ")}.`
          : "";

      const prompt = `You are a demanding technical examiner generating a fresh recall/application multiple-choice question for:
Concept: "${concept.title}"
Summary: ${concept.summary}
${deckTitle ? `Course Subject: "${deckTitle}"` : ""}
${prevQStr}

Generate a BRAND-NEW, distinct multiple-choice question testing conceptual understanding, application, boundary condition, or physical/mechanistic implication of "${concept.title}".
CRITICAL PEDAGOGICAL INSTRUCTION:
- Focus on conceptual, causal, physical-intuition, and comparative reasoning questions.
- NEVER invent multi-step trigonometric or arithmetic calculation problems whose numerical options might be miscalculated.
- NEVER use LaTeX syntax, dollar signs ($), or backslashes (\\theta, \\lambda, \\alpha, \\frac). Always write clean plain Unicode symbols like θ, α, λ, ≤, ≥, ×, ², ∇.

Return ONLY a valid JSON object matching this schema:
{
  "question": "Clear, challenging conceptual question string",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "1-2 sentence explanation of why the correct option is right."
}`;

      const parsed = await callGroqWithRetry(
        groq,
        "You are an expert technical examiner. Respond strictly with a JSON object. Focus on conceptual reasoning without numerical calculations. Never use LaTeX backslashes.",
        prompt,
        800
      );

      if (
        !parsed ||
        !parsed.question ||
        !Array.isArray(parsed.options) ||
        parsed.options.length < 4 ||
        typeof parsed.correctIndex !== "number" ||
        !parsed.explanation
      ) {
        return NextResponse.json(
          { error: HUMAN_ERROR },
          { status: 500 }
        );
      }

      const validOptions = parsed.options.slice(0, 4);
      while (validOptions.length < 4) {
        validOptions.push(
          `Option ${String.fromCharCode(65 + validOptions.length)}`
        );
      }
      const safeCorrectIndex = Math.max(
        0,
        Math.min(3, Math.floor(parsed.correctIndex))
      );

      return NextResponse.json({
        question: cleanMathText(String(parsed.question)),
        options: validOptions.map((o: any) => cleanMathText(String(o))),
        correctIndex: safeCorrectIndex,
        explanation: cleanMathText(String(parsed.explanation)),
      });
    }

    return NextResponse.json({ error: "Unsupported mode" }, { status: 400 });
  } catch (err: any) {
    console.warn("[terrarium-ai] Route handler error:", err?.message || err);
    return NextResponse.json(
      { error: HUMAN_ERROR },
      { status: 500 }
    );
  }
}
