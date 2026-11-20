import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }
  return new Groq({ apiKey });
}

const SYSTEM_PROMPT = `You are Micu, an exceptionally sharp, warm, and engaging spatial voice tutor.
Your voice is being synthesized by ElevenLabs for direct audio playback to the student.

Guidelines:
- Return a natural, spoken-friendly response of exactly 2 to 3 sentences.
- Be concise, vivid, and conversational.
- NEVER use markdown formatting: no asterisks (*, **), no bullet points, no hashes (#), no brackets, no quotes around everything.
- Speak in plain, clear, flowing English sentences suitable for speech synthesis.
- Focus specifically on the requested concept and its core insight.`;

export async function POST(request: NextRequest) {
  try {
    const { conceptTitle, conceptSummary, mode, userQuestion } =
      await request.json();

    if (!conceptTitle || typeof conceptTitle !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'conceptTitle'" },
        { status: 400 }
      );
    }

    let userPrompt = "";

    if (mode === "simple") {
      userPrompt = `Explain the concept "${conceptTitle}" (Summary: ${conceptSummary || ""}) in simple, intuitive, everyday terms that anyone can understand instantly. Exactly 2-3 spoken sentences.`;
    } else if (mode === "analogy") {
      userPrompt = `Provide a memorable, vivid real-world analogy for the concept "${conceptTitle}" (Summary: ${conceptSummary || ""}). Start directly with the analogy. Exactly 2-3 spoken sentences.`;
    } else if (mode === "question" && userQuestion) {
      userPrompt = `The student is studying "${conceptTitle}" (Summary: ${conceptSummary || ""}) and asks you: "${userQuestion}". Answer their question directly and warmly in 2-3 spoken sentences.`;
    } else {
      userPrompt = `Explain the core significance and mechanics of "${conceptTitle}" (Summary: ${conceptSummary || ""}) clearly for a student. Exactly 2-3 spoken sentences.`;
    }

    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 300,
    });

    let rawReply = completion.choices[0]?.message?.content || "";

    // Clean up any stray markdown formatting for ElevenLabs speech synthesis
    const cleanReply = rawReply
      .replace(/[*#_~`>[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return NextResponse.json({
      reply:
        cleanReply ||
        `${conceptTitle} is a key concept. ${conceptSummary || "It forms a foundational pillar in this field."}`,
    });
  } catch (error) {
    console.error("Micu Chat API error:", error);

    // Graceful fallback response
    return NextResponse.json(
      {
        reply:
          "I am having a brief connection pause, but this concept is central to your study. Let me explain the key summary.",
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 200 }
    );
  }
}
