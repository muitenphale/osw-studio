import type { ShellEnv, ShellResult } from '../types';
import { ssDetectEntityBoundary, ssFindSelectorMatch, ssIsHtmlEntity, ssMapNormalizedToOriginal } from '../internals';
import { checkWrite, normalizePath, recordFileVersion } from '../runtime';

/** `ss` — search-and-replace edit of an existing file. */
export async function ssCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx } = env;

  // ss (supersed) — smart file editing with multiple modes
  // Syntax: ss [flags] /path/to/file << 'EOF'\nsearch\n=======\nreplacement\nEOF
  // Modes: (none) literal, --entity, --fuzzy, --regex

  // Parse flags (long form preferred: --entity, --fuzzy, --regex)
  let ssMode: 'literal' | 'entity' | 'fuzzy' | 'regex' = 'literal';
  let ssFilePath = '';
  for (const a of args) {
    if (a === '--entity' || a === '-e') ssMode = 'entity';
    else if (a === '--fuzzy' || a === '-f') ssMode = 'fuzzy';
    else if (a === '--regex' || a === '-r') ssMode = 'regex';
    else if (a && !a.startsWith('-')) ssFilePath = a;
  }

  const ssPath = normalizePath(ssFilePath);
  if (!ssPath) return { stdout: '', stderr: 'ss: missing file path', exitCode: 2 };

  if (stdin === undefined || stdin === '') {
    return { stdout: '', stderr: 'ss: missing heredoc input (use ss /file << \'EOF\')', exitCode: 2 };
  }

  // Split on \n=======\n separator (7 equals signs — avoids collision with JS ===)
  const sepIdx = stdin.indexOf('\n=======\n');
  let ssSearch: string;
  let ssReplace: string;
  if (sepIdx !== -1) {
    ssSearch = stdin.substring(0, sepIdx);
    ssReplace = stdin.substring(sepIdx + '\n=======\n'.length);
  } else if (ssMode === 'entity') {
    // Entity mode: no separator needed — extract selector from first line,
    // use entire stdin as replacement.
    const firstLine = stdin.split('\n')[0].trim();
    ssSearch = firstLine;
    ssReplace = stdin;
  } else {
    return { stdout: '', stderr: 'ss: missing ======= separator between search and replacement\n\nUsage: ss /file << \'EOF\'\nsearch content\n=======\nreplacement content\nEOF', exitCode: 2 };
  }

  // Reject no-op edits where the search and replacement are identical. This catches
  // the case where content is silently mangled upstream (e.g. HTML-entity decoding
  // collapsing both sides equally) and would otherwise report a false "1 replacement".
  if (ssMode !== 'entity' && ssSearch === ssReplace) {
    return { stdout: '', stderr: `ss: search and replacement are identical — no change to ${ssPath}`, exitCode: 2 };
  }

  // Read target file
  let ssContent: string;
  try {
    const file = await vfs.readFile(projectId, ssPath);
    if (typeof file.content !== 'string') {
      return { stdout: '', stderr: `ss: ${ssPath}: binary file`, exitCode: 1 };
    }
    ssContent = file.content;
  } catch (e: any) {
    return { stdout: '', stderr: `ss: ${ssPath}: ${e?.message || 'file not found'}`, exitCode: 1 };
  }

  // Only --entity is a whole-chunk replace (keys on a selector, replaces the whole
  // entity with agent-supplied text) — gate it. Literal/fuzzy/regex are surgical and
  // self-protecting, so they aren't blocked, only tracked for baseline accuracy.
  const ssChk = await checkWrite(vfs, projectId, ctx, ssPath, ssMode === 'entity');
  if (ssChk.block) return ssChk.block;

  let ssResult: string;

  switch (ssMode) {
    case 'literal': {
      const idx = ssContent.indexOf(ssSearch);
      if (idx === -1) {
        const preview = ssSearch.length > 200 ? ssSearch.substring(0, 200) + '...' : ssSearch;
        return { stdout: '', stderr: `ss: search text not found in ${ssPath}\n\nSearched for:\n${preview}`, exitCode: 1 };
      }
      ssResult = ssContent.substring(0, idx) + ssReplace + ssContent.substring(idx + ssSearch.length);
      break;
    }
    case 'entity': {
      const selectorMatch = ssFindSelectorMatch(ssContent, ssSearch);
      if (!selectorMatch) {
        const preview = ssSearch.length > 200 ? ssSearch.substring(0, 200) + '...' : ssSearch;
        return { stdout: '', stderr: `ss --entity: selector not found in ${ssPath}\n\nSearched for:\n${preview}`, exitCode: 1 };
      }
      const isHtml = ssIsHtmlEntity(selectorMatch.normalizedSelector);
      const boundary = ssDetectEntityBoundary(ssContent, selectorMatch.index, selectorMatch.normalizedSelector, isHtml);
      if (!boundary) {
        return { stdout: '', stderr: `ss --entity: could not detect entity boundary for selector in ${ssPath}`, exitCode: 1 };
      }
      ssResult = ssContent.substring(0, boundary.start) + ssReplace + ssContent.substring(boundary.end);
      break;
    }
    case 'fuzzy': {
      const normalizeForFuzzy = (s: string) => s.split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ').replace(/\s+/g, ' ');
      const normalizedSearch = normalizeForFuzzy(ssSearch);
      const origRange = ssMapNormalizedToOriginal(ssContent, normalizedSearch);
      if (!origRange) {
        const preview = ssSearch.length > 200 ? ssSearch.substring(0, 200) + '...' : ssSearch;
        return { stdout: '', stderr: `ss -f: search text not found (even with whitespace normalization) in ${ssPath}\n\nSearched for:\n${preview}`, exitCode: 1 };
      }
      ssResult = ssContent.substring(0, origRange.start) + ssReplace + ssContent.substring(origRange.end);
      break;
    }
    case 'regex': {
      let re: RegExp;
      try {
        re = new RegExp(ssSearch, 's'); // dotall mode
      } catch (e: any) {
        return { stdout: '', stderr: `ss -r: invalid regex: ${e?.message || 'parse error'}`, exitCode: 2 };
      }
      const m = re.exec(ssContent);
      if (!m) {
        const preview = ssSearch.length > 200 ? ssSearch.substring(0, 200) + '...' : ssSearch;
        return { stdout: '', stderr: `ss -r: regex did not match in ${ssPath}\n\nPattern:\n${preview}`, exitCode: 1 };
      }
      // Expand $0, $1, $2, ... backreferences in replacement (single-pass to avoid $1 clobbering $10)
      // Use $$ to produce a literal $ (e.g. "$$10" → "$10")
      const expandedReplace = ssReplace
        .replace(/\$\$/g, '\x00DOLLAR\x00')
        .replace(/\$(\d+)/g, (_, idx) => m[Number(idx)] || '')
        .replace(/\x00DOLLAR\x00/g, '$');
      ssResult = ssContent.substring(0, m.index) + expandedReplace + ssContent.substring(m.index + m[0].length);
      break;
    }
  }

  try {
    await vfs.updateFile(projectId, ssPath, ssResult);
    if (ssChk.wasCurrent) { try { recordFileVersion(ctx, ssPath, await vfs.readFile(projectId, ssPath)); } catch { /* best-effort version record */ } }
    return { stdout: `(1 replacement in ${ssPath})`, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return { stdout: '', stderr: `ss: ${ssPath}: ${e?.message || 'cannot write file'}`, exitCode: 1 };
  }
}
