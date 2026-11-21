import { formatCompact, formatPeriod, formatRupiah } from "@/lib/format"
import type { Cashflow } from "@/lib/types"

/**
 * Grafik batang arus kas ringan (SVG murni, tanpa library) untuk Beranda.
 * Recharts (~100 KB) hanya dipakai di halaman Laporan agar beranda tetap cepat dimuat di HP.
 */
export function MiniCashflow({ data }: { data: Cashflow }) {
  const points = data.points
  const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)))
  const totalIn = points.reduce((s, p) => s + p.income, 0)
  const totalOut = points.reduce((s, p) => s + p.expense, 0)
  const W = 300
  const H = 120
  const slot = W / Math.max(points.length, 1)
  const bar = Math.max(1.5, Math.min(6, slot / 2 - 1))
  const y = (v: number) => H - (v / max) * H
  const ticks = [0, Math.floor(points.length / 2), points.length - 1].filter((i, idx, a) => points[i] && a.indexOf(i) === idx)

  return (
    <figure className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Arus kas ${points.length} hari: masuk ${formatRupiah(totalIn)}, keluar ${formatRupiah(totalOut)}`}
      >
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" strokeWidth={1} />
        <text x={0} y={10} className="fill-muted-foreground text-[8px]">
          {formatCompact(max)}
        </text>
        {points.map((p, i) => {
          const x = i * slot + slot / 2
          return (
            <g key={p.period}>
              <title>{`${formatPeriod(p.period, data.group_by)}: masuk ${formatRupiah(p.income)}, keluar ${formatRupiah(p.expense)}`}</title>
              <rect x={x - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              {p.income > 0 && <rect x={x - bar - 0.5} y={y(p.income)} width={bar} height={H - y(p.income)} rx={1} className="fill-income" />}
              {p.expense > 0 && <rect x={x + 0.5} y={y(p.expense)} width={bar} height={H - y(p.expense)} rx={1} className="fill-expense" />}
            </g>
          )
        })}
        {ticks.map((i) => (
          <text
            key={i}
            x={i * slot + slot / 2}
            y={H + 12}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[8px]"
          >
            {formatPeriod(points[i].period, data.group_by)}
          </text>
        ))}
      </svg>
      <figcaption className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-income" aria-hidden /> Masuk {formatRupiah(totalIn)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-expense" aria-hidden /> Keluar {formatRupiah(totalOut)}
        </span>
      </figcaption>
    </figure>
  )
}
