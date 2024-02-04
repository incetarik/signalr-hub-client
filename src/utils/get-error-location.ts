/**
 * Gets the location of an error excluding this library lines.
 *
 * @param {Error} error The error to read its stack trace.
 * @return {string | undefined} The position of the stack trace
 * that's not within this library.
 *
 * @export
 *
 * @__PURE__
 */
export function getErrorLocation(error: Error | undefined): string | undefined {
  if (typeof error !== 'object') return
  if (error === null) return

  const { stack } = error
  if (!stack) return

  const lines = stack.split('\n')
  lines.splice(0, 1)

  for (const line of lines) {
    if (line.indexOf('useListener') >= 0) continue
    if (line.indexOf('define-hub') >= 0) continue
    return line.trim().slice(3)
  }
}
