import fs from 'fs';
import path from 'path';

function parseBraceAuthors(text) {
  const authors = [];
  const matches = text.match(/\{[^}]*\}/g) ?? [];
  for (const match of matches) {
    const body = match.slice(1, -1).trim();
    if (!body) continue;
    for (const rawPart of body.split(',')) {
      const author = rawPart.trim();
      if (author) authors.push(author);
    }
  }
  return uniqueAuthors(authors);
}

function uniqueAuthors(authors) {
  return [...new Set(authors.map((value) => value.trim()).filter(Boolean))];
}

function cleanSentence(value) {
  return value
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAuthorsFromSentence(sentence) {
  const authors = [];

  const byMatches = [...sentence.matchAll(/\bby\s+([^.;]+)/gi)];
  for (const match of byMatches) {
    const chunk = match[1].replace(/\sand\s/gi, ',').replace(/\s+/g, ' ').trim();

    for (const rawPart of chunk.split(',')) {
      let part = rawPart.trim();
      if (!part) continue;

      // If a descriptive clause has another "by", keep only the final name portion.
      const nestedBy = part.match(/\bby\s+(.+)$/i);
      if (nestedBy) part = nestedBy[1].trim();

      part = part
        .replace(/^\b(?:original|fixed version|based on|script adjustments|full)\b\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (part) authors.push(part);
    }
  }

  const thanksMatch = sentence.match(/\bthanks to\s+([^.;]+)/i);
  if (thanksMatch) {
    for (const name of thanksMatch[1].split(',')) {
      const trimmed = name.replace(/\s+for\b.*$/i, '').trim();
      if (trimmed) authors.push(trimmed);
    }
  }

  return uniqueAuthors(authors);
}

function parsePlainTextLines(lines) {
  const credits = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;

    const separators = [' - ', ': '];
    let added = false;

    for (const separator of separators) {
      const idx = line.indexOf(separator);
      if (idx <= 0) continue;

      const authorText = line.slice(0, idx).trim();
      const notes = line.slice(idx + separator.length).trim();
      if (!authorText) break;

      credits.push({
        authors: uniqueAuthors(authorText.split(',')),
        notes: notes || undefined,
      });
      added = true;
      break;
    }

    if (!added) {
      const authors = extractAuthorsFromSentence(line);
      if (authors.length > 0) {
        credits.push({ authors, notes: line });
      }
    }
  }

  return credits.filter((entry) => entry.authors.length > 0);
}

function extractMarkdownCreditsBlock(lines) {
  const startIndex = lines.findIndex((line) => /^#{1,6}\s*credits?\b/i.test(line.trim()));
  if (startIndex < 0) return [];

  const block = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,6}\s+/.test(line.trim())) break;
    block.push(line);
  }

  return block;
}

function parseMarkdownCredits(lines) {
  const block = extractMarkdownCreditsBlock(lines);
  if (block.length === 0) return [];

  const text = block.join('\n');
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((part) => cleanSentence(part))
    .filter(Boolean)
    .filter((part) => !part.startsWith(':---'));

  const credits = [];
  for (const paragraph of paragraphs) {
    if (paragraph.startsWith('![')) continue;
    if (/^\|/.test(paragraph)) continue;

    const authors = extractAuthorsFromSentence(paragraph);
    if (authors.length === 0) continue;

    credits.push({
      authors,
      notes: paragraph,
    });
  }

  return credits;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAuthorText(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDuplicateAuthor(candidate, seen) {
  if (candidate === seen) return true;

  // If a shortened alias is mentioned later (e.g. "Jono" after "Jono the Red"),
  // treat it as the same person and skip the repeat.
  if (candidate.length < seen.length) {
    const boundaryPattern = new RegExp(`\\b${escapeRegex(candidate)}\\b`, 'i');
    if (boundaryPattern.test(seen)) return true;
  }

  return false;
}

function dedupeAuthorsAcrossEntries(credits) {
  const seenAuthors = [];
  const deduped = [];

  for (const entry of credits) {
    const uniqueForEntry = [];
    for (const author of entry.authors ?? []) {
      const normalized = normalizeAuthorText(author);
      if (!normalized) continue;

      const duplicate = seenAuthors.some((seen) => isDuplicateAuthor(normalized, seen));
      if (duplicate) continue;

      seenAuthors.push(normalized);
      uniqueForEntry.push(author);
    }

    if (uniqueForEntry.length === 0) continue;
    deduped.push({
      ...entry,
      authors: uniqueForEntry,
    });
  }

  return deduped;
}

export function normalizeMarkdownKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function parseAuthorsFromText(text) {
  const line = String(text ?? '').trim();
  if (!line) return [];

  const authors = new Set();
  for (const author of parseBraceAuthors(line)) authors.add(author);

  for (const author of extractAuthorsFromSentence(cleanSentence(line))) {
    authors.add(author);
  }

  const meMatch = line.match(/\bto me\s*,\s*([^.;]+)/i);
  if (meMatch) {
    for (const part of meMatch[1].replace(/\sand\s/gi, ',').split(',')) {
      const author = part.trim();
      if (author) authors.add(author);
    }
  }

  const creditsMatch = line.match(/\bcredits?\s*:\s*([^.;]+)/i);
  if (creditsMatch) {
    for (const part of creditsMatch[1].replace(/\sand\s/gi, ',').split(',')) {
      const author = part.trim();
      if (author) authors.add(author);
    }
  }

  return [...authors];
}

export function readMarkdownSections(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  const sections = [];
  let current = null;

  function pushCurrent() {
    if (!current) return;
    sections.push(current);
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      pushCurrent();
      current = {
        level: headingMatch[1].length,
        title: headingMatch[2].trim(),
        lines: [],
      };
      continue;
    }

    if (!current) continue;
    current.lines.push(line);
  }

  pushCurrent();
  return sections;
}

export function parseCreditsFile(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const extension = path.extname(filePath).toLowerCase();
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);

  if (extension === '.md') {
    const markdownCredits = parseMarkdownCredits(lines);
    if (markdownCredits.length > 0) return dedupeAuthorsAcrossEntries(markdownCredits);
  }

  return dedupeAuthorsAcrossEntries(parsePlainTextLines(lines));
}
