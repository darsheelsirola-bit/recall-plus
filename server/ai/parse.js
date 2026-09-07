/**
 * Parse model chat content into JSON without eval or mutating replacements.
 * Accepts raw JSON or a single Markdown code fence wrapping JSON.
 */
export function parseStructuredContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) return null
  const candidates = jsonCandidates(content)
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null
}

function jsonCandidates(content) {
  const trimmed = content.trim()
  const candidates = [trimmed]
  const fenced = extractFencedBlock(trimmed)
  if (fenced) candidates.push(fenced)
  const objectSlice = sliceJsonObject(fenced || trimmed)
  if (objectSlice) candidates.push(objectSlice)
  return [...new Set(candidates)]
}

function extractFencedBlock(text) {
  const match = text.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i)
  if (match) return match[1].trim()
  const sameLine = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return sameLine ? sameLine[1].trim() : null
}

function sliceJsonObject(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return text.slice(start, end + 1)
}
