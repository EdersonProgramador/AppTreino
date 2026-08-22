export function extractHashtags(text: string) {
  const matches = text.match(/#([\p{L}0-9_]{2,40})/gu) || [];
  return [...new Set(matches.map(tag => tag.slice(1).toLowerCase()))];
}

export function extractMentions(text: string) {
  const matches = text.match(/@([A-Za-z0-9._-]{2,40})/g) || [];
  return [...new Set(matches.map(item => item.slice(1)))];
}
