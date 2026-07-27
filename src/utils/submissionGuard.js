export function createSubmissionGuard() {
  let submitted = false

  return {
    claim() {
      if (submitted) return false
      submitted = true
      return true
    },
    reset() {
      submitted = false
    },
  }
}
