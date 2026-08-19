/** Minúsculas sin tildes — mismo folding en web y bot. */
export function foldText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
