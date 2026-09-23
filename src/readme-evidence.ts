// Preserve useful sections beyond a long introduction without sending the entire README.
export function selectReadmeEvidence(readme: string | null, budget = 16000) {
  if (!readme) return "";
  if (readme.length <= budget) return readme;
  const lines = readme.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [{ heading: "Introduction", lines: [] }];
  let fence = "";
  for (const line of lines) {
    const marker = line.trim().match(/^(`{3,}|~{3,})/);
    if (marker) { fence = fence ? (marker[1][0] === fence[0] ? "" : fence) : marker[1]; }
    const heading = !fence && line.match(/^#{1,4}\s+(.+)/);
    if (heading) sections.push({ heading: heading[1], lines: [line] });
    else sections[sections.length - 1].lines.push(line);
  }
  const selected = new Map<number, string>();
  let remaining = budget;
  const take = (index: number, limit: number) => {
    if (selected.has(index) || remaining < 80) return;
    const text = sections[index].lines.join("\n").slice(0, Math.min(limit, remaining - 30));
    if (!text.trim()) return;
    selected.set(index, text);
    remaining -= text.length + 30;
  };
  take(0, 1600);
  if (sections.length > 1) take(1, 2400);
  for (const pattern of [
    /features?|overview|what is|capabilit|功能|特性|介绍|概览/i,
    /quick.?start|getting started|install|usage|examples?|使用|安装|上手|运行要求/i,
    /architect|structure|how it works|结构|架构|原理/i,
  ]) {
    sections.forEach((section, index) => { if (pattern.test(section.heading)) take(index, 2200); });
  }
  return [...selected.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join("\n\n[README excerpt]\n\n").slice(0, budget);
}
