import { NextRequest, NextResponse } from "next/server";

const DEFAULT_FALLBACK_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

function sanitizeForSpeech(raw: string): string {
  return raw
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizeWithElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string
) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5",
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 }
      );
    }

    const cleanText = sanitizeForSpeech(text);
    if (!cleanText) {
      return NextResponse.json(
        { error: "Empty speech text" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId =
      process.env.ELEVENLABS_VOICE_ID?.trim() || "YgGyNrYN0x7CzQCOJoyh";

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "ELEVENLABS_API_KEY not configured",
          code: "missing_api_key",
        },
        { status: 503 }
      );
    }

    let response = await synthesizeWithElevenLabs(cleanText, apiKey, voiceId);

    // If custom voiceId is inaccessible or missing on this API key, retry with built-in fallback voice
    if (
      (response.status === 404 || response.status === 400) &&
      voiceId !== DEFAULT_FALLBACK_VOICE_ID
    ) {
      response = await synthesizeWithElevenLabs(
        cleanText,
        apiKey,
        DEFAULT_FALLBACK_VOICE_ID
      );
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const code =
        errorData?.detail?.code ||
        errorData?.detail?.status ||
        `http_${response.status}`;
      const message =
        errorData?.detail?.message || `ElevenLabs error: ${response.status}`;
      console.error("ElevenLabs error:", response.status, code, message);
      return NextResponse.json(
        { error: message, code, details: errorData },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Speak API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}