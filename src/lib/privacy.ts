export function maskName(value: string | null | undefined) {
  const name = value?.trim() ?? "";
  if (!name) return "-";
  return `${name.slice(0, Math.min(2, name.length))}***`;
}

export function maskFixed(value: string | null | undefined, visibleDigits: number) {
  const text = value?.trim() ?? "";
  if (!text) return "-";
  return `${text.slice(0, visibleDigits)}${"*".repeat(Math.max(3, text.length - visibleDigits))}`;
}

export function maskPhone(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return "-";
  return `${text.slice(0, 3)}${"*".repeat(Math.max(3, text.length - 3))}`;
}

export function maskAddress(value: string | null | undefined) {
  return value?.trim() ? "Alamat disamarkan" : "-";
}

export function guestDisplayName(value: string | null | undefined, isGuest: boolean) {
  return isGuest ? maskName(value) : (value?.trim() || "-");
}
