/** Scale max_tokens budget based on input text length. */
export function tokensFor(text: string, min = 1500, max = 4000): number {
  return Math.min(max, Math.max(min, Math.ceil(text.length / 15)));
}
