export function normalizeText(input) {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .trim()
    .toLowerCase()
    .replace(/[’´`]/g, "'")
    .replace(/\s+/g, " ");
}

export function normalizeKey(input) {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
