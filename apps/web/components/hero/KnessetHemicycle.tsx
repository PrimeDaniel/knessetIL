"use client";

import { useState, useMemo, useRef } from "react";
import { useParties } from "@/hooks/useParties";
import { useMembers } from "@/hooks/useMembers";
import { getPartyMeta } from "@/lib/knesset-parties";
import { cn } from "@/lib/utils";
import type { Faction, MKProfile } from "@knesset/types";

// ── Seat geometry ─────────────────────────────────────────────────────────────
// Ported from design's hero.jsx — 7 concentric arcs, 120 seats total.
interface SeatGeom { cx: number; cy: number; }

function buildHemicycleSeats(total: number): SeatGeom[] {
  const rows = 7, innerR = 17, outerR = 47;
  const radii = Array.from({ length: rows }, (_, r) => innerR + ((outerR - innerR) * r) / (rows - 1));
  const weightSum = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map(r => Math.max(8, Math.round((r / weightSum) * total)));

  // Adjust last row so total is exact
  let diff = total - perRow.reduce((a, b) => a + b, 0);
  let idx = perRow.length - 1;
  while (diff !== 0) {
    if (diff > 0) { perRow[idx]++; diff--; }
    else { perRow[idx]--; diff++; }
    idx = (idx - 1 + perRow.length) % perRow.length;
  }

  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const seats: SeatGeom[] = [];
  for (let r = 0; r < rows; r++) {
    const n = perRow[r], radius = radii[r];
    const span = Math.PI * (0.96 + 0.04 * (r / (rows - 1)));
    const a0 = -Math.PI + (Math.PI - span) / 2;
    const a1 = a0 + span;
    for (let k = 0; k < n; k++) {
      const angle = a0 + ((k + 0.5) / n) * (a1 - a0);
      seats.push({ cx: r4(50 + radius * Math.cos(angle)), cy: r4(50 + radius * Math.sin(angle)) });
    }
  }
  // Sort left→right by angle
  return seats.sort((a, b) => Math.atan2(a.cy - 50, a.cx - 50) - Math.atan2(b.cy - 50, b.cx - 50));
}

// ── Enriched party shape ──────────────────────────────────────────────────────
interface EnrichedParty {
  id: number;
  name: string;
  seats: number;
  color: string;
  coalition: boolean;
  arcOrder: number;
}

function enrichParties(factions: Faction[]): EnrichedParty[] {
  return factions
    .filter(f => f.name && f.member_count > 0)
    .map(f => {
      const meta = getPartyMeta(f.name);
      return { id: f.id, name: f.name, seats: f.member_count, ...meta };
    })
    .sort((a, b) => a.arcOrder - b.arcOrder);
}

// Assign each seat index → party id, based on arc-ordered proportional fills
function assignSeats(seats: SeatGeom[], parties: EnrichedParty[]): (number | null)[] {
  const seq: number[] = [];
  for (const p of parties) {
    for (let i = 0; i < p.seats; i++) seq.push(p.id);
  }
  return seats.map((_, i) => seq[i] ?? null);
}

// ── Tooltip state ─────────────────────────────────────────────────────────────
interface HoverState { mkName: string; partyName: string; x: number; y: number; }

// ── Coalition stat card ───────────────────────────────────────────────────────
function CoalitionStatCard({
  label, count, total, parties,
}: {
  label: string; count: number; total: number; parties: EnrichedParty[];
}) {
  return (
    <div className="relative rounded-xl border border-border bg-gradient-to-b from-card to-background p-5 shadow-card overflow-hidden
                    after:absolute after:top-0 after:inset-x-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-amber-500/45 after:to-transparent">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">{label}</div>
      <div className="font-serif text-5xl leading-none font-medium">
        {count}
        <sup className="text-base text-muted-foreground font-sans font-normal align-top me-1">/{total}</sup>
      </div>
      <div className="h-[7px] rounded-full bg-muted mt-4 overflow-hidden flex" dir="ltr">
        {parties.map(p => (
          <span
            key={p.id}
            style={{ width: `${(p.seats / count) * 100}%`, background: p.color }}
            className="block h-full"
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function KnessetHemicycle() {
  const { data: partiesData } = useParties({ is_active: true });
  const { data: membersData } = useMembers({ is_current: true, limit: 100 });

  const parties = useMemo(
    () => enrichParties(partiesData?.data ?? []),
    [partiesData],
  );

  const totalSeats = useMemo(
    () => parties.reduce((s, p) => s + p.seats, 0) || 120,
    [parties],
  );

  const seats = useMemo(() => buildHemicycleSeats(totalSeats), [totalSeats]);
  const seatAssignment = useMemo(() => assignSeats(seats, parties), [seats, parties]);

  const partyMap = useMemo(
    () => Object.fromEntries(parties.map(p => [p.id, p])),
    [parties],
  );

  // Group MKs by party for hover tooltips
  const mksByParty = useMemo(() => {
    const map: Record<number, MKProfile[]> = {};
    for (const mk of membersData?.data ?? []) {
      const pid = mk.current_faction?.id;
      if (pid != null) {
        (map[pid] ??= []).push(mk);
      }
    }
    return map;
  }, [membersData]);

  const [hovered, setHovered] = useState<HoverState | null>(null);
  const [activeParty, setActiveParty] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const coalitionParties = parties.filter(p => p.coalition);
  const oppositionParties = parties.filter(p => !p.coalition);
  const coalitionSeats = coalitionParties.reduce((s, p) => s + p.seats, 0);
  const oppositionSeats = totalSeats - coalitionSeats;

  function handleSeatEnter(idx: number) {
    const partyId = seatAssignment[idx];
    if (partyId == null || !containerRef.current) return;
    const party = partyMap[partyId];
    if (!party) return;

    // Which MK slot in this party?
    const partySeats = seatAssignment.slice(0, idx + 1).filter(id => id === partyId);
    const mkIdx = partySeats.length - 1;
    const partyMks = mksByParty[partyId] ?? [];
    const mk = partyMks[mkIdx];

    const rect = containerRef.current.getBoundingClientRect();
    const seat = seats[idx];
    const x = (seat.cx / 100) * rect.width;
    const y = (seat.cy / 55) * rect.height;

    setHovered({
      mkName: mk ? mk.mk_individual_name : party.name,
      partyName: party.name,
      x,
      y,
    });
  }

  const activePartyData = activeParty != null ? partyMap[activeParty] : null;

  return (
    <section className="relative border-b border-border overflow-hidden bg-background">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 900px 500px at 50% -200px, hsl(222 40% 14%) 0%, transparent 60%)",
        }}
      />

      <div className="relative max-w-[1320px] mx-auto px-8 py-16">
        {/* Kicker */}
        <div className="flex items-center gap-3 mb-6 animate-fade-up font-mono text-[11px] uppercase tracking-[0.24em] text-amber-500">
          <span className="block w-8 h-px bg-amber-500 shrink-0" />
          הכנסת ה־25 · מושב חורף 2026
        </div>

        {/* Title */}
        <h1 className="font-serif text-[clamp(40px,5.4vw,72px)] font-semibold max-w-4xl mb-5 leading-[1.12] animate-fade-up [animation-delay:80ms]">
          {totalSeats} מושבים.{" "}
          <em className="not-italic text-amber-500">
            קואליציה של {coalitionSeats}.
          </em>{" "}
          כל הצבעה, חשופה.
        </h1>

        {/* Lede */}
        <p className="text-lg text-muted-foreground max-w-2xl mb-12 leading-relaxed animate-fade-up [animation-delay:160ms]">
          מעקב יומיומי אחרי החקיקה שעוברת — ולא עוברת — במשכן.
          רחפו מעל מושב כדי לראות מי יושב בו, או לחצו על סיעה כדי לבודד אותה.
        </p>

        {/* Hemicycle grid */}
        <div className="grid grid-cols-[1fr_300px] gap-14 items-start max-[980px]:grid-cols-1">
          {/* SVG wrapper */}
          <div ref={containerRef} className="relative w-full" style={{ aspectRatio: "2.1/1" }}>
            <svg viewBox="0 0 100 55" className="w-full h-full block">
              {seats.map((s, i) => {
                const partyId = seatAssignment[i];
                const party = partyId != null ? partyMap[partyId] : null;
                const color = party?.color ?? "#6B7280";
                const dimmed = activeParty != null && activeParty !== partyId;
                return (
                  <circle
                    key={i}
                    cx={s.cx}
                    cy={s.cy}
                    r={1.15}
                    fill={color}
                    style={{
                      cursor: "pointer",
                      opacity: dimmed ? 0.1 : 1,
                      filter: hovered && seatAssignment[i] === activeParty
                        ? `drop-shadow(0 0 3px ${color})`
                        : undefined,
                      transition: "opacity 200ms",
                      transformOrigin: "center",
                      transformBox: "fill-box",
                      animationDelay: `${i * 5}ms`,
                    }}
                    className="animate-seat-pop"
                    onMouseEnter={() => handleSeatEnter(i)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
              {/* Podium mark */}
              <path d="M 47 51 L 53 51 L 52 53 L 48 53 Z" fill="currentColor" opacity={0.25} />
            </svg>

            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-[6%] pointer-events-none">
              <span className="font-serif text-[clamp(48px,7vw,90px)] font-medium leading-none tracking-tight">
                {activePartyData ? activePartyData.seats : totalSeats}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground mt-2">
                {activePartyData ? activePartyData.name : "מושבים בכנסת"}
              </span>
            </div>

            {/* Hover tooltip */}
            {hovered && (
              <div
                className="absolute pointer-events-none z-10 bg-foreground text-background px-3 py-2 rounded-md text-[13px] font-semibold whitespace-nowrap shadow-lg"
                style={{
                  left: hovered.x,
                  top: hovered.y,
                  transform: "translate(-50%, -135%)",
                }}
              >
                {hovered.mkName}
                <span className="block font-mono text-[10px] uppercase tracking-wider opacity-60 mt-0.5 font-medium">
                  {hovered.partyName}
                </span>
              </div>
            )}
          </div>

          {/* Coalition stats */}
          <aside className="flex flex-col gap-4 animate-fade-up [animation-delay:240ms]">
            <CoalitionStatCard
              label="קואליציה"
              count={coalitionSeats}
              total={totalSeats}
              parties={coalitionParties}
            />
            <CoalitionStatCard
              label="אופוזיציה"
              count={oppositionSeats}
              total={totalSeats}
              parties={oppositionParties}
            />
            {/* Majority threshold */}
            <div className="rounded-xl border border-dashed border-border p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                רוב להעברת חוק
              </div>
              <div className="font-serif text-5xl leading-none font-medium text-amber-500">
                61
                <sup className="text-base text-muted-foreground font-sans font-normal align-top me-1">+</sup>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground mt-2.5 tracking-wide">
                רוב רגיל של חברי הכנסת הנוכחים
              </div>
            </div>
          </aside>
        </div>

        {/* Party legend */}
        <div className="flex flex-wrap gap-1.5 mt-10 pt-7 border-t border-border animate-fade-up [animation-delay:360ms]">
          {parties.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveParty(activeParty === p.id ? null : p.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all hover:-translate-y-px",
                activeParty === p.id
                  ? "border-foreground bg-card"
                  : "border-border bg-card hover:bg-accent/10",
              )}
            >
              <span
                className="inline-block w-[11px] h-[11px] rounded-sm shrink-0"
                style={{ background: p.color }}
              />
              <span className="text-foreground">{p.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{p.seats}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
