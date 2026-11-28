import { describe, it, expect } from "vitest";
import {
  normalizeItemAnalysis,
  parseCSVWithMapping,
  parseWideFormat,
  readCSVFile,
  readCSVFileWithDetection,
  validateCorrectAnswers,
} from "@/lib/excel-utils";
import { examRow, makeFile } from "./helpers";

describe("normalizeItemAnalysis", () => {
  it("parses the NEW / Question Map format with optional fields", () => {
    const rows = normalizeItemAnalysis(
      [
        { Version: "1", "Version Q#": "2", "Master Q#": "1", Permutation: "BCADE", Correct: "A", Points: "5", Group: "1" },
        { Version: "V2", "Version Q#": "1", "Master Q#": "1" },
        { Version: "005", "Version Q#": "3", "Master Q#": "2" },
        { Version: "1", "Version Q#": "x", "Master Q#": "1" }, // invalid order -> dropped
      ],
      "NEW"
    );
    expect(rows).toEqual([
      { code: 1, order: 2, order_in_master: 1, permutation: "BCADE", correct: "A", points: 5, group: 1 },
      { code: "V2", order: 1, order_in_master: 1 },
      { code: 5, order: 3, order_in_master: 2 }, // numeric codes lose leading zeros
    ]);
  });

  it("parses the OLD format", () => {
    expect(normalizeItemAnalysis([{ code: "3", order: "4", "order in master": "2" }], "OLD")).toEqual([
      { code: 3, order: 4, order_in_master: 2 },
    ]);
  });

  it("parses with a manual column mapping", () => {
    expect(
      parseCSVWithMapping([{ Form: "A", Pos: "1", Master: "3" }], {
        code: "Form",
        order: "Pos",
        orderInMaster: "Master",
      })
    ).toEqual([{ code: "A", order: 1, order_in_master: 3 }]);
  });
});

describe("parseWideFormat (Options Matrix), hand-checked permutations", () => {
  const columns = ["Q", "Option", "Master_Correct", "version_1_Q", "version_1_Opt", "version_2_Q", "version_2_Opt"];
  const wide = [
    // Master Q1, correct B. Version 1 identity at Q1; version 2 rotates A->C, B->A, C->B at Q3.
    { Q: 1, Option: "A", Master_Correct: "", version_1_Q: 1, version_1_Opt: "A", version_2_Q: 3, version_2_Opt: "C" },
    { Q: 1, Option: "B", Master_Correct: "YES", version_1_Q: 1, version_1_Opt: "B", version_2_Q: 3, version_2_Opt: "A" },
    { Q: 1, Option: "C", Master_Correct: "", version_1_Q: 1, version_1_Opt: "C", version_2_Q: 3, version_2_Opt: "B" },
    { Q: 1, Option: "D", Master_Correct: "", version_1_Q: 1, version_1_Opt: "D", version_2_Q: 3, version_2_Opt: "D" },
    { Q: 1, Option: "E", Master_Correct: "", version_1_Q: 1, version_1_Opt: "E", version_2_Q: 3, version_2_Opt: "E" },
    // Master Q2, two options only, correct A. Version 2 swaps A and B at Q1.
    { Q: 2, Option: "A", Master_Correct: "Y", version_1_Q: 2, version_1_Opt: "A", version_2_Q: 1, version_2_Opt: "B" },
    { Q: 2, Option: "B", Master_Correct: "", version_1_Q: 2, version_1_Opt: "B", version_2_Q: 1, version_2_Opt: "A" },
  ];

  it("builds version->master permutations and maps the correct answer per version", () => {
    // Permutation string is indexed by the VERSION letter and gives the MASTER letter.
    // Q1 v2: version A=master B, B=C, C=A  -> "BCADE"; master B appears as version "A".
    // Q2 v2: version A=master B, B=A      -> "BACDE"; master A appears as version "B".
    expect(parseWideFormat(wide, columns)).toEqual([
      { code: 1, order: 1, order_in_master: 1, permutation: "ABCDE", correct: "B" },
      { code: 2, order: 3, order_in_master: 1, permutation: "BCADE", correct: "A" },
      { code: 1, order: 2, order_in_master: 2, permutation: "ABCDE", correct: "A" },
      { code: 2, order: 1, order_in_master: 2, permutation: "BACDE", correct: "B" },
    ]);
  });

  it("rejects non-sequential version numbers", () => {
    const cols = ["Q", "Option", "Master_Correct", "version_1_Q", "version_1_Opt", "version_3_Q", "version_3_Opt"];
    expect(() => parseWideFormat([], cols)).toThrow(/sequential/);
  });

  it("accepts sequential versions that do not start at 1", () => {
    const cols = ["Q", "Option", "Master_Correct", "version_5_Q", "version_5_Opt", "version_6_Q", "version_6_Opt"];
    const rows = parseWideFormat(
      [{ Q: 1, Option: "A", Master_Correct: "YES", version_5_Q: 1, version_5_Opt: "A", version_6_Q: 1, version_6_Opt: "A" }],
      cols
    );
    expect(rows.map((r) => r.code)).toEqual([5, 6]);
  });
});

describe("validateCorrectAnswers", () => {
  const exam = [examRow("0", "1", ["ACDE", "B"]), examRow("201900001", "1", ["A", "B"])];

  it("accepts a key letter contained in a multi-answer solution cell", () => {
    expect(
      validateCorrectAnswers(
        [
          { code: 1, order: 1, order_in_master: 1, permutation: "ABCDE", correct: "A" },
          { code: 1, order: 2, order_in_master: 2, permutation: "ABCDE", correct: "B" },
        ],
        exam
      )
    ).toBeNull();
  });

  it("reports a mismatch with version and question", () => {
    expect(
      validateCorrectAnswers([{ code: 1, order: 2, order_in_master: 2, permutation: "ABCDE", correct: "C" }], exam)
    ).toContain("Version 1, Q2: the item analysis file says 'C', solution row has 'B'");
  });

  it("skips validation without permutation data or without a matching solution row", () => {
    expect(validateCorrectAnswers([{ code: 1, order: 2, order_in_master: 2, correct: "C" }], exam)).toBeNull();
    expect(
      validateCorrectAnswers([{ code: 9, order: 1, order_in_master: 1, permutation: "ABCDE", correct: "E" }], exam)
    ).toBeNull();
  });
});

describe("CSV format detection through FileReader + SheetJS", () => {
  const detect = async (csv: string) => (await readCSVFileWithDetection(makeFile(csv, "ia.csv"))).format;

  it("detects each supported format", async () => {
    expect(await detect("Version,Version Q#,Master Q#\n1,1,2\n")).toBe("NEW");
    expect(await detect("code,order,order in master\n1,1,1\n")).toBe("OLD");
    expect(
      await detect("Q,Option,Master_Correct,version_1_Q,version_1_Opt\n1,A,YES,1,A\n")
    ).toBe("WIDE");
    expect(await detect("a,b\n1,2\n")).toBe("UNKNOWN");
  });

  it("reads numeric-looking codes as numbers", async () => {
    const { data } = await readCSVFileWithDetection(makeFile("Version,Version Q#,Master Q#\n001,1,2\n", "ia.csv"));
    expect(data[0]).toEqual({ Version: 1, "Version Q#": 1, "Master Q#": 2 });
  });

  it("readCSVFile parses a WIDE file end to end", async () => {
    // As exported by the Shuffler tool: the first data row carries Master_Correct
    const csv = [
      "Q,Option,Master_Correct,version_1_Q,version_1_Opt,version_2_Q,version_2_Opt",
      "1,A,YES,1,A,3,C",
      "1,B,,1,B,3,A",
      "1,C,,1,C,3,B",
    ].join("\n");
    // Version 2: version A=master B, B=C, C=A -> "BCADE"; master A appears as version "C"
    expect(await readCSVFile(makeFile(csv, "wide.csv"))).toEqual([
      { code: 1, order: 1, order_in_master: 1, permutation: "ABCDE", correct: "A" },
      { code: 2, order: 3, order_in_master: 1, permutation: "BCADE", correct: "C" },
    ]);
  });

  // KNOWN ISSUE (pre-existing, see references/UPGRADE_PLAN.md findings): format
  // detection reads column names from the first data row only, and SheetJS omits
  // blank cells, so a WIDE file whose first row has an empty Master_Correct is
  // detected as UNKNOWN. `it.fails` passes while the bug exists; once fixed, this
  // test will start failing and should be turned into a normal test.
  it.fails("KNOWN ISSUE: detects WIDE when the first row's Master_Correct is blank", async () => {
    const csv = [
      "Q,Option,Master_Correct,version_1_Q,version_1_Opt",
      "1,A,,1,A",
      "1,B,YES,1,B",
    ].join("\n");
    expect((await readCSVFileWithDetection(makeFile(csv, "wide.csv"))).format).toBe("WIDE");
  });
});
