import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }
  return new Groq({ apiKey });
}

const SYSTEM_PROMPT = `You are an expert at extracting core technical concepts from educational text and creating study materials. 

Given a text (which may be from a PDF), extract 8-12 core technical concepts. Ignore:
- Cover pages, title pages, table of contents
- College/university names, author headers, page numbers
- Copyright notices, dedications, acknowledgments
- Non-technical fluff, marketing language

For each concept, return a JSON object with:
- title: Clean, concise concept name (max 60 chars)
- summary: Clear 2-3 sentence explanation suitable for voice narration
- links: Array of 0-3 other concept titles this connects to (will be matched by title)
- quiz: {
    question: A clear question testing understanding of this concept
    answers: Array of exactly 4 distinct options (strings)
    correctIndex: 0-3 index of the correct answer
    explanation: Brief 1-2 sentence explanation of why the correct answer is right
  }

Return ONLY a JSON object with this exact structure:
{
  "concepts": [
    {
      "title": "string",
      "summary": "string",
      "links": ["string", ...],
      "quiz": {
        "question": "string",
        "answers": ["string", "string", "string", "string"],
        "correctIndex": 0,
        "explanation": "string"
      }
    },
    ...
  ]
}

Ensure:
- Exactly 8-12 concepts
- All 4 quiz answers are distinct
- correctIndex is valid (0-3)
- No extra fields, no markdown, no commentary`;

export async function POST(request: NextRequest) {
  try {
    const { text, title } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 }
      );
    }

    // Truncate to first 18,000 characters to stay within token limits
    const truncatedText = text.slice(0, 18000);

    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract concepts from this text${title ? ` (titled: ${title})` : ""}:\n\n${truncatedText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from Groq" },
        { status: 500 }
      );
    }

    let parsed: { concepts: any[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON response from model" },
        { status: 500 }
      );
    }

    // Validate the response structure
    if (!parsed.concepts || !Array.isArray(parsed.concepts)) {
      return NextResponse.json(
        { error: "Missing 'concepts' array in response" },
        { status: 500 }
      );
    }

    if (parsed.concepts.length < 8 || parsed.concepts.length > 12) {
      return NextResponse.json(
        { error: `Expected 8-12 concepts, got ${parsed.concepts.length}` },
        { status: 500 }
      );
    }

    // Validate each concept
    for (const concept of parsed.concepts) {
      if (
        !concept.title ||
        !concept.summary ||
        !concept.quiz ||
        !Array.isArray(concept.quiz.answers) ||
        concept.quiz.answers.length !== 4 ||
        typeof concept.quiz.correctIndex !== "number" ||
        concept.quiz.correctIndex < 0 ||
        concept.quiz.correctIndex > 3 ||
        !concept.quiz.question ||
        !concept.quiz.explanation
      ) {
        return NextResponse.json(
          { error: "Invalid concept structure in response" },
          { status: 500 }
        );
      }
      // Ensure answers are distinct
      const uniqueAnswers = new Set(concept.quiz.answers);
      if (uniqueAnswers.size !== 4) {
        return NextResponse.json(
          { error: "Quiz answers must be distinct" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Generate graph error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}