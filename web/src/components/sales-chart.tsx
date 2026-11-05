import { scaleBand, scaleLinear } from "d3-scale";
import { short, rs } from "@/lib/utils";
import { useNarrow } from "@/lib/use-narrow";

/** Sales vs profit bars (d3 scales + React SVG, same role as shadcn charts) */
export function SalesChart({ data }: { data: { date: Date; sales: number; profit: number }[] }) {
  const narrow = useNarrow();
  const W = narrow ? 380 : 760, H = narrow ? 240 : 230, L = narrow ? 40 : 44, B = 26, T = 8;
  const fs = narrow ? 13 : 11;
  const labelEvery = narrow ? Math.max(1, Math.ceil(data.length / 4)) : 5;
  const x = scaleBand<number>().domain(data.map((_, i) => i)).range([L, W - 4]).padding(0.28);
  const max = Math.max(...data.map((d) => d.sales), 1);
  const y = scaleLinear().domain([0, max]).nice(4).range([H - B, T]);
  const bw = x.bandwidth() / 2;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily sales and profit">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#E6E9EE" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={fs} fill="#66707A">{short(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x(i)} y={y(d.sales)} width={bw} height={H - B - y(d.sales)} rx="2" fill="#1B6B63"><title>{`${d.date.toDateString()}: sales ${rs(d.sales)}`}</title></rect>
            <rect x={x(i)! + bw + 1} y={y(d.profit)} width={Math.max(0, bw - 1)} height={H - B - y(d.profit)} rx="2" fill="#9CCBC2"><title>{`profit ${rs(d.profit)}`}</title></rect>
            {i % labelEvery === 0 && <text x={x(i)! + x.bandwidth() / 2} y={H - 8} textAnchor="middle" fontSize={fs} fill="#66707A">{d.date.getDate()} {d.date.toLocaleString("en", { month: "short" })}</text>}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[12.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-primary" />Sales</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#9CCBC2]" />Profit</span>
      </figcaption>
    </figure>
  );
}
