// Best-effort check for whether a model can read image attachments (#131).
//
// The renderer only has model *ids* (no capability metadata), and the SDK
// silently drops images for non-vision models. A perfect answer needs per-
// provider capability data; until that exists, this recognises the well-known
// multimodal families and the common text/code-only families by id. It is
// deliberately CONSERVATIVE: it returns null ("unknown") for anything it isn't
// sure about, so the UI only warns when a model is *confidently* text-only —
// vision models and unknown models are never falsely flagged. Pure + tested.

const VISION = [
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-5/,
  /\bo[134]\b/,
  /chatgpt/, // OpenAI multimodal
  /claude/, // Claude 3+/4 are all vision-capable
  /gemini/,
  /pixtral/,
  /llava/,
  /internvl/,
  /qwen[\d.]*-?vl/, // qwen-vl / qwen2.5-vl (NOT qwen-coder)
  /llama[\d.-]*(?:vision|scout|maverick)/, // llama 3.2 vision / llama 4
  /grok-(?:2-vision|4)/,
  /\bvision\b/,
  /\bvl\b/
]

const TEXT_ONLY = [
  /deepseek/,
  /codestral/,
  /devstral/,
  /codellama/,
  /starcoder/,
  /qwen[\d.]*-?coder/,
  /\bkimi\b/,
  /mixtral/,
  /command-r/,
  /nemotron/
]

/**
 * `true` if the model is a known vision-capable family, `false` if it's a known
 * text/code-only family, `null` if unknown (don't warn — could be either).
 */
export function modelSupportsImages(modelId: string | null | undefined): boolean | null {
  const id = (modelId ?? '').toLowerCase()
  if (!id) return null
  if (VISION.some((re) => re.test(id))) return true
  if (TEXT_ONLY.some((re) => re.test(id))) return false
  return null
}

/** True when attaching images to this model would be silently dropped (confidently non-vision). */
export function imagesWouldBeDropped(modelId: string | null | undefined): boolean {
  return modelSupportsImages(modelId) === false
}

export const NON_VISION_ATTACH_HINT =
  "This model can't read images — switch to a vision-capable model to attach one."
