/**
 * FileDropZone: each instance opens its own file chooser (the template dialog
 * puts a second one on the page), and dropped files are checked like chosen ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FileDropZone, fileRejection } from "@/components/shared/file-drop-zone";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = (name: string, size = 10) => new File(["x".repeat(size)], name);

describe("fileRejection", () => {
  it("checks the extension (case-insensitive) and the size", () => {
    expect(fileRejection(file("map.CSV"), ".csv")).toBeNull();
    expect(fileRejection(file("data.xlsx"), ".xls,.xlsx,.csv,.txt")).toBeNull();
    expect(fileRejection(file("notes.pdf"), ".csv")).toMatch(/not an accepted file type \(\.csv\)/);
    expect(fileRejection(file("map.csv", 2 * 1024 * 1024), ".csv", 1)).toMatch(/larger than 1 MB/);
    expect(fileRejection(file("anything.bin"), "")).toBeNull();
  });
});

describe("FileDropZone", () => {
  let container: HTMLDivElement;
  let root: Root;
  const first = vi.fn();
  const second = vi.fn();

  beforeEach(async () => {
    first.mockReset();
    second.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          "div",
          null,
          createElement(FileDropZone, { onFileSelect: first, title: "First" }),
          createElement(FileDropZone, { onFileSelect: second, title: "Second", accept: ".csv", maxSizeMB: 1 })
        )
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const inputs = () => [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  const zones = () => [...container.querySelectorAll<HTMLDivElement>(":scope > div > div")];
  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];

  it("gives every instance its own input", () => {
    const [a, b] = inputs();
    expect(a.id).not.toBe("");
    expect(a.id).not.toBe(b.id);
  });

  it("Choose File opens the chooser of its own instance", () => {
    const clicked: HTMLInputElement[] = [];
    const spy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      clicked.push(this);
    });
    act(() => buttons()[1].click());
    act(() => buttons()[0].click());
    expect(clicked).toEqual([inputs()[1], inputs()[0]]);
    spy.mockRestore();
  });

  const drop = (zone: HTMLElement, f: File) => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [f] } });
    act(() => {
      zone.dispatchEvent(event);
    });
  };
  const choose = (input: HTMLInputElement, f: File) => {
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  it("rejects a dropped file of the wrong type or size, and accepts a valid one", () => {
    const zone = zones()[1];
    drop(zone, file("notes.txt"));
    expect(second).not.toHaveBeenCalled();
    expect(zone.querySelector('[role="alert"]')?.textContent).toMatch(/not an accepted file type/);

    drop(zone, file("big.csv", 2 * 1024 * 1024));
    expect(second).not.toHaveBeenCalled();
    expect(zone.querySelector('[role="alert"]')?.textContent).toMatch(/larger than 1 MB/);

    drop(zone, file("map.csv"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(zone.querySelector('[role="alert"]')).toBeNull();
    expect(first).not.toHaveBeenCalled();
  });

  it("applies the same checks to a chosen file", () => {
    choose(inputs()[1], file("notes.txt"));
    expect(second).not.toHaveBeenCalled();
    choose(inputs()[1], file("map.csv"));
    expect(second).toHaveBeenCalledTimes(1);
    choose(inputs()[0], file("answers.xls"));
    expect(first).toHaveBeenCalledTimes(1);
  });
});
