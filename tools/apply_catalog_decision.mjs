import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const valuesFor = (name) => {
  const values = [];
  for (let index = 2; index < process.argv.length; index++) {
    if (process.argv[index] === name && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1]);
      index++;
    }
  }
  return values;
};
const valueFor = (name, fallback = null) => valuesFor(name).at(-1) ?? fallback;
const floor = valueFor('--floor');
const kind = valueFor('--kind');
const adoptTokens = valuesFor('--adopt').flatMap(value => value.split(',')).filter(Boolean);
const excludeTokens = [...valuesFor('--exclude'), ...valuesFor('--reject')];
const remakeTokens = valuesFor('--remake');
const adoptedReason = valueFor('--adopt-reason', '所長採用');

if (!floor || !kind || (!adoptTokens.length && !excludeTokens.length && !remakeTokens.length)) {
  console.error('Usage: node tools/apply_catalog_decision.mjs --floor 1f --kind silhouette --adopt 3,5 --exclude "2:大きすぎる" --remake "7:役割は必要だがフォルムが違う"');
  process.exit(1);
}

const parseNumber = value => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid catalog number: ${value}`);
  return parsed;
};
const parseReasonToken = (token, label) => {
  const separator = token.indexOf(':');
  if (separator < 1 || !token.slice(separator + 1).trim()) {
    throw new Error(`${label} requires a reason: --${label} "2:大きすぎる" (received ${token})`);
  }
  return { number: parseNumber(token.slice(0, separator)), reason: token.slice(separator + 1).trim() };
};

const decisions = new Map();
const addDecision = (number, decision) => {
  if (decisions.has(number)) throw new Error(`Catalog number ${number} was decided twice`);
  decisions.set(number, decision);
};
for (const token of adoptTokens) addDecision(parseNumber(token), { status: 'adopted', reason: adoptedReason });
for (const token of excludeTokens) {
  const parsed = parseReasonToken(token, 'exclude');
  addDecision(parsed.number, { status: 'excluded', reason: parsed.reason });
}
for (const token of remakeTokens) {
  const parsed = parseReasonToken(token, 'remake');
  addDecision(parsed.number, { status: 'remake', reason: parsed.reason });
}

const silhouetteMode = kind === 'silhouette';
const ledgerUrl = silhouetteMode
  ? new URL(`assets/prototypes/floor-silhouettes/${floor}/decision-manifest.json`, root)
  : new URL('data/asset-catalog.json', root);
const ledger = JSON.parse(await readFile(ledgerUrl, 'utf8'));
const candidates = silhouetteMode
  ? ledger.entries.filter(entry => (entry.floor ?? '1f') === floor)
  : ledger.entries.filter(entry => entry.floor === floor && entry.kind === kind && entry.status === 'candidate');
const candidateByNumber = new Map(candidates.map(entry => [entry.number, entry]));
for (const number of decisions.keys()) {
  if (!candidateByNumber.has(number)) throw new Error(`Candidate ${number} does not exist for ${floor}/${kind}`);
}

const decidedOn = new Date().toISOString().slice(0, 10);
const canonNotes = [];
for (const [number, decision] of decisions) {
  const entry = candidateByNumber.get(number);
  entry.status = decision.status;
  entry.decidedOn = decidedOn;
  entry.reason = decision.reason;
  if (decision.status === 'excluded' || decision.status === 'remake') {
    const label = decision.status === 'excluded' ? '除外' : '作り直し';
    canonNotes.push(`- ${decidedOn} ${label}: ${entry.name ?? entry.id} — ${decision.reason}`);
  }
}
await writeFile(ledgerUrl, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

if (canonNotes.length) {
  const canonUrl = new URL(`docs/floors/${floor}/CANON.md`, root);
  let canon = await readFile(canonUrl, 'utf8');
  const heading = '## このフロアで避けること';
  const at = canon.indexOf(heading);
  if (at < 0) throw new Error(`${canonUrl.pathname}: missing heading ${heading}`);
  const insertAt = canon.indexOf('\n', at + heading.length) + 1;
  const uniqueNotes = canonNotes.filter(note => !canon.includes(note));
  if (uniqueNotes.length) {
    canon = `${canon.slice(0, insertAt)}\n${uniqueNotes.join('\n')}\n${canon.slice(insertAt)}`;
    await writeFile(canonUrl, canon, 'utf8');
  }
}

for (const [number, decision] of decisions) {
  const entry = candidateByNumber.get(number);
  console.log(`${number}: ${entry.id} -> ${decision.status} (${decision.reason})`);
}
console.log(`\n${silhouetteMode ? 'シルエット台本' : 'アセット台帳'}と1F正本を更新しました。`);
