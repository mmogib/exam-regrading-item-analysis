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
    // Permutation string is indexed by the VERSION letter and gives the MASTER letter,
    // with one letter per real option (P7: no padding to five).
    // Q1 v2: version A=master B, B=C, C=A  -> "BCADE"; master B appears as version "A".
    // Q2 (two options) v2: version A=master B, B=A -> "BA"; master A appears as version "B".
    expect(parseWideFormat(wide, columns)).toEqual([
      { code: 1, order: 1, order_in_master: 1, permutation: "ABCDE", correct: "B" },
      { code: 2, order: 3, order_in_master: 1, permutation: "BCADE", correct: "A" },
      { code: 1, order: 2, order_in_master: 2, permutation: "AB", correct: "A" },
      { code: 2, order: 1, order_in_master: 2, permutation: "BA", correct: "B" },
    ]);
  });

  it("rejects non-sequential version numbers", () => {
    const cols = ["Q", "Option", "Master_Correct", "version_1_Q", "version_1_Opt", "version_3_Q", "version_3_Opt"];
    expect(() => parseWideFormat([], cols)).toThrow(/sequential/);
  });

  it("accepts sequential versions that do not start at 1", () => {
    const cols = ["Q", "Option", "Master_Correct", "version_5_Q", "version_5_Opt", "version_6_Q", "version_6_Opt"];
    const rows = parseWideFormat(
      [
        { Q: 1, Option: "A", Master_Correct: "YES", version_5_Q: 1, version_5_Opt: "A", version_6_Q: 1, version_6_Opt: "B" },
        { Q: 1, Option: "B", Master_Correct: "", version_5_Q: 1, version_5_Opt: "B", version_6_Q: 1, version_6_Opt: "A" },
      ],
      cols
    );
    expect(rows.map((r) => r.code)).toEqual([5, 6]);
    expect(rows.map((r) => r.permutation)).toEqual(["AB", "BA"]);
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

  it("keeps cell text as written; Step 3 then reads all-digit codes as numbers (P12)", async () => {
    const { data, format } = await readCSVFileWithDetection(makeFile("Version,Version Q#,Master Q#\n001,1,2\n1A,1,2\n", "ia.csv"));
    expect(data[0]).toEqual({ Version: "001", "Version Q#": "1", "Master Q#": "2" });
    expect(normalizeItemAnalysis(data, format as "NEW").map((r) => r.code)).toEqual([1, "1A"]);
  });

  it("readCSVFile parses a WIDE file end to end", async () => {
    // As exported by the Shuffler tool: the first data row carries Master_Correct
    const csv = [
      "Q,Option,Master_Correct,version_1_Q,version_1_Opt,version_2_Q,version_2_Opt",
      "1,A,YES,1,A,3,C",
      "1,B,,1,B,3,A",
      "1,C,,1,C,3,B",
    ].join("\n");
    // Three options. Version 2: version A=master B, B=C, C=A -> "BCA"; master A appears as version "C"
    expect(await readCSVFile(makeFile(csv, "wide.csv"))).toEqual([
      { code: 1, order: 1, order_in_master: 1, permutation: "ABC", correct: "A" },
      { code: 2, order: 3, order_in_master: 1, permutation: "BCA", correct: "C" },
    ]);
  });

  // P3 (fixed in 1.9.1): the column names come from the header row, so a blank
  // Master_Correct in the first data row no longer hides that column.
  it("detects WIDE when the first row's Master_Correct is blank, with the same mapping", async () => {
    const blankFirst = ["Q,Option,Master_Correct,version_1_Q,version_1_Opt", "1,A,,1,B", "1,B,YES,1,A"].join("\n");
    const flagFirst = ["Q,Option,Master_Correct,version_1_Q,version_1_Opt", "1,B,YES,1,A", "1,A,,1,B"].join("\n");
    const detection = await readCSVFileWithDetection(makeFile(blankFirst, "wide.csv"));
    expect(detection.format).toBe("WIDE");
    expect(detection.columns).toContain("Master_Correct");
    expect(await readCSVFile(makeFile(blankFirst, "wide.csv"))).toEqual(await readCSVFile(makeFile(flagFirst, "wide2.csv")));
    expect(await readCSVFile(makeFile(blankFirst, "wide.csv"))).toEqual([
      { code: 1, order: 1, order_in_master: 1, permutation: "BA", correct: "A" },
    ]);
  });
});
