/**
 * errors.mjs — shared runtime error information builder
 * Error details are log information unless an official output schema admits them.
 */

/**
 * Convert a caught error into structured runtime error information.
 * @param {Error|unknown} err
 * @param {string} layer — one of: sdu, pci, feature, next-pdu, executor, load
 */
export function toErrorPDU(err, layer) {
  return {
    layer,
    code: err?.code ?? err?.name ?? 'Error',
    message: err?.message ?? String(err),
    context: err?.context ?? {},
  }
}
