export const mark = (label: string) => performance.mark(label);
export const span = (start: string, end: string) => {
  performance.mark(end);
  const m = performance.measure(`${start}→${end}`, start, end);
  // Ship to your observability webhook if desired
  console.log(`[metric] ${m.name}: ${m.duration.toFixed(1)}ms`);
};
