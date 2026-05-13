export function mapLpcCredits(sourceCredits) {
  const credits = Array.isArray(sourceCredits) ? sourceCredits : [];

  const licenses = new Set();
  const mappedCredits = credits
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
    for (const license of entry.licenses ?? []) {
      if (license) licenses.add(license);
    }

    const mapped = {
      authors: [...new Set(entry.authors ?? [])],
    };

    if ((entry.urls?.length ?? 0) > 0) mapped.urls = [...new Set(entry.urls)];
    if (entry.notes) mapped.notes = entry.notes;
    return mapped;
  });

  const license = [...licenses].sort((a, b) => a.localeCompare(b)).join(', ');
  return {
    license,
    credits: mappedCredits,
  };
}
