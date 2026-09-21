// The error strings are the product.
//
// This repo exists so somebody's first pull request anywhere goes well. The
// YAML is a slang dictionary; the messages the validator prints when that YAML
// is wrong are the actual teaching. Break one and nothing goes red — every
// message still prints, the script still exits 1, CI still passes. The only
// person who finds out is a first-timer getting a stack trace at the exact
// moment this repo exists to make painless.
//
// So: run the REAL validator against deliberately broken fixture repos and read
// back what a contributor would actually see. Not a reimplementation of the
// messages, which could drift from the ones in use — the messages themselves.
//
// Each case lays test/fixtures/<case>/ over test/fixtures/_base/ in a temp
// directory, so a case folder holds only the file it breaks.
//
// Run: npm test   (or: node --test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const fixtures = join(here, "fixtures");

// Lay the case over the base and run the validator against the result.
function run(caseName) {
  const dir = mkdtempSync(join(tmpdir(), "translatah-"));
  try {
    cpSync(join(fixtures, "_base"), dir, { recursive: true });
    const overlay = join(fixtures, caseName);
    if (!existsSync(overlay)) assert.fail(`no fixture at test/fixtures/${caseName}/`);
    cpSync(overlay, dir, { recursive: true });

    const r = spawnSync(process.execPath, [join(repo, "scripts/validate.mjs"), "--root", dir], {
      encoding: "utf8",
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}`.replaceAll(dir + "/", "") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The base has to pass, or every failure below proves nothing.
test("the fixture base is a repo that passes", () => {
  const { code, out } = run("_base");
  assert.equal(code, 0, out);
  assert.match(out, /0 problem\(s\)/);
});

// ---------------------------------------------------------------------------
// Entries: region, folder, sources, filename. (PR #1)
// ---------------------------------------------------------------------------

const entryCases = [
  {
    name: "unknown region names the registry and lists what it knows",
    fixture: "unknown-region",
    expect: [
      `region "nope-999" isn't in data/regions.yml.`,
      `Known: boston, brockton-508, stl-314.`,
      `New city? Add it there first — that's the whole plumbing.`,
    ],
  },
  {
    name: "region/folder mismatch says which two disagree",
    fixture: "region-folder-mismatch",
    expect: [`region "stl-314" but the file sits in "boston/" — move it or fix the region`],
  },
  {
    name: "a missing source is refused in the repo's own words",
    fixture: "missing-source",
    expect: [`no source cited — this is a dictionary, not a bathroom wall`],
  },
  {
    name: "filename/term mismatch names both spellings",
    fixture: "filename-term-mismatch",
    expect: [`filename "x.yml" should match the term slug "zzz.yml"`],
  },
  {
    name: "the retired `boston:` phrase key asks for `local`",
    fixture: "old-boston-key",
    expect: [`must have required property 'local'`],
  },
];

for (const c of entryCases) {
  test(c.name, () => {
    const { code, out } = run(c.fixture);
    assert.equal(code, 1, `expected a failure, got:\n${out}`);
    for (const want of c.expect) assert.ok(out.includes(want), `missing ${JSON.stringify(want)} in:\n${out}`);
  });
}

// ---------------------------------------------------------------------------
// The registry. This is the file a newcomer edits first, so it gets the most
// care — and it collects every problem in one pass rather than one per run.
// (PR #1)
// ---------------------------------------------------------------------------

const registryCases = [
  {
    name: "a bad slug shows the shape wanted and the value given",
    fixture: "bad-slug-in-registry",
    expect: [`every region needs a lowercase-with-dashes slug (got "BAD_ONE")`],
  },
  {
    name: "a duplicate slug says which one",
    fixture: "duplicate-slug",
    expect: [`"boston" is listed twice.`],
  },
  {
    name: "inheriting a stranger names both ends",
    fixture: "unknown-inherits",
    expect: [`"q" inherits "nowhere", which isn't a region here.`],
  },
  {
    name: "an inheritance loop prints the whole chain",
    fixture: "inheritance-loop",
    expect: [`inheritance loop: aa → bb → aa. Somebody has to be the parent.`],
  },
  {
    name: "an accent file that isn't there says so",
    fixture: "missing-accent-file",
    expect: [`"boston" points at accent file "ghost.yml", which doesn't exist`],
  },
];

for (const c of registryCases) {
  test(c.name, () => {
    const { code, out } = run(c.fixture);
    assert.equal(code, 1, `expected a failure, got:\n${out}`);
    for (const want of c.expect) assert.ok(out.includes(want), `missing ${JSON.stringify(want)} in:\n${out}`);
  });
}

test("a registry problem stops the run before entries are judged", () => {
  const { out } = run("duplicate-slug");
  assert.match(out, /Fix the region list first — everything else is checked against it\./);
});

test("an untouched _TEMPLATE is skipped rather than failed", () => {
  const { code, out } = run("unmodified-template");
  assert.equal(code, 0, out);
});

// ---------------------------------------------------------------------------
// Curricula: the only layer that reads across two regions, so it's the only one
// that can break because of an edit somewhere else entirely. Every message has
// to say WHICH end broke. (PR #4)
// ---------------------------------------------------------------------------

const curriculumCases = [
  {
    name: "unknown destination region says destination, not just region",
    fixture: "curriculum-unknown-destination",
    expect: [
      `destination region "nowhere-000" isn't in data/regions.yml.`,
      `Known: boston, brockton-508, stl-314.`,
    ],
  },
  {
    name: "a destination with no accent explains why that's fatal",
    fixture: "curriculum-destination-no-accent",
    expect: [
      `destination region "stl-314" has no accent: file in data/regions.yml, so it has no rules.`,
      `A curriculum needs an accent at both ends.`,
    ],
  },
  {
    name: "teaching a rule that doesn't exist lists the rules that do",
    fixture: "curriculum-teaches-unknown-rule",
    expect: [
      `lesson 3 ("Move OR toward AR") teaches "or-to-arr", which isn't a rule in data/pronunciation/stl-314.yml.`,
      `That file has: keep-the-r, or-to-ar, intrusive-r-wash, french-flattening, northern-cities-shift.`,
    ],
  },
  {
    name: "un-teaching a rule that doesn't exist looks in the ORIGIN's engine",
    fixture: "curriculum-unteaches-unknown-rule",
    expect: [
      `lesson 2 ("Stop putting R's between vowels") un-teaches "intrusive-rs", which isn't a rule in data/pronunciation/rules.yml.`,
      `That file has: drop-final-r, intrusive-r, er-to-ah, broad-a, o-to-aw, fast-speech.`,
    ],
  },
  {
    name: "two lessons at the same order name both",
    fixture: "curriculum-duplicate-order",
    expect: [`are both order 3. Lessons run in sequence — give them different numbers.`],
  },
  {
    name: "a lesson that moves nothing is refused",
    fixture: "curriculum-lesson-moves-nothing",
    expect: [`neither learns nor unlearns a rule. A lesson has to move something.`],
  },
  {
    name: "a filename off-convention is given the right one",
    fixture: "curriculum-filename-mismatch",
    expect: [
      `filename "stl.yml" should be "boston-to-stl-314.yml" — the convention is <from>-to-<to>.yml`,
    ],
  },
  {
    name: "an accent file of the wrong shape says what shape it wants",
    fixture: "curriculum-accent-not-a-list",
    expect: [
      `couldn't read the rules out of data/pronunciation/stl-314.yml — it should be a list of rules, each with an id.`,
    ],
  },
];

for (const c of curriculumCases) {
  test(c.name, () => {
    const { code, out } = run(c.fixture);
    assert.equal(code, 1, `expected a failure, got:\n${out}`);
    for (const want of c.expect) assert.ok(out.includes(want), `missing ${JSON.stringify(want)} in:\n${out}`);
  });
}

// ---------------------------------------------------------------------------
// House style. These hold for every message, including ones added later, which
// is the part that protects the next contributor rather than the last one.
// ---------------------------------------------------------------------------

const everyFailure = [...entryCases, ...registryCases, ...curriculumCases].map((c) => c.fixture);

test("no message ever shows a stack trace", () => {
  for (const fixture of everyFailure) {
    const { out } = run(fixture);
    assert.doesNotMatch(out, /\n\s+at .+:\d+:\d+/, `stack trace in ${fixture}:\n${out}`);
    assert.ok(!out.includes("node:internal"), `internals leaked in ${fixture}:\n${out}`);
  }
});

test("no message leaks an absolute path from the machine it ran on", () => {
  for (const fixture of everyFailure) {
    const { out } = run(fixture);
    assert.doesNotMatch(out, /\/(Users|home|private|var)\//, `absolute path in ${fixture}:\n${out}`);
  }
});

test("every failure exits 1 and says it isn't merge-ready", () => {
  for (const fixture of everyFailure) {
    const { code, out } = run(fixture);
    assert.equal(code, 1, `${fixture} should exit 1:\n${out}`);
    assert.match(out, /Not merge-ready|Fix the region list first/, `${fixture}:\n${out}`);
  }
});
