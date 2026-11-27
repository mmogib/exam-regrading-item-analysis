/**
 * Generate a dummy exam dataset in every input form the app accepts.
 *
 *   npm run gen:dummy -- [options]
 *
 * Output goes to dummy_data/<name>/ (gitignored). See README.md in each folder.
 * Core logic: lib/dummy-data.ts (shared with the in-app template downloads).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildBundle,
  buildDataset,
  datasetFromQuestionMap,
  DEFAULT_PARAMS,
  expectedResults,
  type CodeStyle,
  type DummyDataset,
} from "@/lib/dummy-data";

const HELP = `Usage: npm run gen:dummy -- [options]

  --students <n>        total students, spread over versions   (default ${DEFAULT_PARAMS.students})
  --questions <n>       number of questions                    (default ${DEFAULT_PARAMS.questions})
  --versions <n>        number of exam versions                (default ${DEFAULT_PARAMS.versions})
  --seed <n>            random seed; same seed = same files    (default ${DEFAULT_PARAMS.seed})
  --codes <style>       student-file codes: padded (001), plain (1), alpha (V1)   (default padded)
  --blank-rate <x>      probability of a blank answer          (default ${DEFAULT_PARAMS.blankRate})
  --no-plants           do not plant problem questions
  --no-shuffle          keep master question order in every version (options still shuffled)
  --from-shuffler <csv> simulate students for a real Shuffler Question Map
                        (--questions/--versions come from the map)
  --plant-miskey        with --from-shuffler: also plant one wrong key in the student files
  --out <dir>           output folder                          (default dummy_data/<name>)
  --help                show this help
`;

function parseArgs(argv: string[]) {
  const flags = new Set(["--no-plants", "--no-shuffle", "--plant-miskey", "--help"]);
  const values: Record<string, string> = {};
  const set = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (flags.has(arg)) set.add(arg);
    else if (arg.startsWith("--") && i + 1 < argv.length) values[arg] = argv[++i];
    else throw new Error(`Unexpected argument "${arg}". Run with --help.`);
  }
  const int = (name: string, fallback: number) => {
    if (!(name in values)) return fallback;
    const n = Number(values[name]);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
    return n;
  };
  const codes = (values["--codes"] ?? "padded") as CodeStyle;
  if (!["padded", "plain", "alpha"].includes(codes)) throw new Error("--codes must be padded, plain or alpha");
  const blankRate = values["--blank-rate"] !== undefined ? Number(values["--blank-rate"]) : DEFAULT_PARAMS.blankRate;
  return { values, set, int, codes, blankRate };
}

function main() {
  const { values, set, int, codes, blankRate } = parseArgs(process.argv.slice(2));
  if (set.has("--help")) {
    console.log(HELP);
    return;
  }

  const seed = int("--seed", DEFAULT_PARAMS.seed);
  const students = int("--students", DEFAULT_PARAMS.students);
  const shuffler = values["--from-shuffler"];
  let ds: DummyDataset;
  let name: string;

  if (shuffler) {
    if ("--questions" in values || "--versions" in values) {
      throw new Error("--questions and --versions come from the Question Map; do not pass them with --from-shuffler");
    }
    if (!existsSync(shuffler)) throw new Error(`File not found: ${shuffler}`);
    ds = datasetFromQuestionMap(readFileSync(shuffler, "utf8"), {
      students,
      seed,
      codeStyle: codes,
      blankRate,
      plants: !set.has("--no-plants"),
      plantMiskey: set.has("--plant-miskey"),
    });
    name = `shuffler_${path.basename(shuffler, ".csv")}_seed${seed}`;
  } else {
    if (set.has("--plant-miskey")) throw new Error("--plant-miskey is for --from-shuffler (generated data always has its planted miskey)");
    ds = buildDataset({
      students,
      questions: int("--questions", DEFAULT_PARAMS.questions),
      versions: int("--versions", DEFAULT_PARAMS.versions),
      seed,
      codeStyle: codes,
      plants: !set.has("--no-plants"),
      shuffleQuestions: !set.has("--no-shuffle"),
      blankRate,
    });
    const p = ds.exam.params;
    name = `seed${p.seed}_n${p.students}_k${p.questions}_v${p.versions}`;
  }

  const out = path.resolve(values["--out"] ?? path.join("dummy_data", name));
  mkdirSync(out, { recursive: true });
  const bundle = buildBundle(ds);
  for (const f of bundle) writeFileSync(path.join(out, f.name), f.content);

  // Shuffler mode: keep the user's own item-analysis files next to the generated students, unchanged
  const copied: string[] = [];
  if (shuffler) {
    const candidates = [shuffler, shuffler.replace(/_mapping\.csv$/, "_options_mapping.csv")];
    for (const src of new Set(candidates)) {
      if (existsSync(src)) {
        copyFileSync(src, path.join(out, path.basename(src)));
        copied.push(path.basename(src));
      }
    }
  }

  const e = expectedResults(ds);
  console.log(`Wrote ${bundle.length + copied.length} files to ${out}`);
  console.log(`  ${e.generator.params.students} students, ${e.generator.params.questions} questions, ${e.generator.params.versions} versions, seed ${seed}`);
  console.log(`  reference KR-20 ${e.reliability.KR20.toFixed(3)}; planted: ${e.planted.map((p) => `${p.kind} (Q${p.master})`).join(", ") || "none"}`);
  if (copied.length) console.log(`  Shuffler files copied unchanged: ${copied.join(", ")}`);
  console.log("  See README.md in that folder for what each file is for.");
}

try {
  main();
} catch (err) {
  console.error(`gen:dummy: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
