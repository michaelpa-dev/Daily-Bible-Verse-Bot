function singleLine(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPassageLines(passage) {
  const verses = Array.isArray(passage?.verses) ? passage.verses : [];
  if (verses.length === 0) {
    return ['(no verses returned)'];
  }

  return verses.map((verse) => {
    const verseNumber = Number(verse.verse || 0);
    const label = verseNumber > 0 ? `**${verseNumber}**` : '**?**';
    const text = singleLine(verse.text);
    return text ? `${label} ${text}` : label;
  });
}

function buildEmbedTitle(reference, translationId) {
  const ref = String(reference || '').trim();
  const translation = String(translationId || '')
    .trim()
    .toUpperCase();
  if (!ref) {
    return translation ? `Passage (${translation})` : 'Passage';
  }
  return translation ? `${ref} (${translation})` : ref;
}

module.exports = {
  buildEmbedTitle,
  formatPassageLines,
};
