/** NDJSON framing for the run stream. Client-safe. */

export const NDJSON_TYPE = "application/x-ndjson; charset=utf-8";

export function ndjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/** Splits streamed text into complete lines, holding a partial line until it ends. */
export function createLineDecoder() {
  let rest = "";
  const take = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    push(chunk: string): string[] {
      const text = rest + chunk;
      const cut = text.lastIndexOf("\n");
      if (cut === -1) {
        rest = text;
        return [];
      }
      rest = text.slice(cut + 1);
      return take(text.slice(0, cut));
    },
    end(): string[] {
      const out = take(rest);
      rest = "";
      return out;
    },
  };
}
