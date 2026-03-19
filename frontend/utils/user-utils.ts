export function getUserInitials(user: { email: string; name?: string | null }) {
  const source = user.name?.trim() || user.email;
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}
