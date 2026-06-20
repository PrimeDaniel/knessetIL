"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { MKAvatar } from "@/components/members/MKAvatar";
import type { PartyVoteBreakdown, MKVoteRecord } from "@knesset/types";

interface FactionVotePanelProps {
  partyBreakdown: PartyVoteBreakdown[];
  mkVotes?: MKVoteRecord[];
  className?: string;
}

const DECISION_LABEL: Record<string, string> = {
  for:     "בעד",
  against: "נגד",
  abstain: "נמנע",
  absent:  "נעדר",
};

// Border tint per decision for the clickable MK chips.
const DECISION_CHIP: Record<string, string> = {
  for:     "border-green-300 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20",
  against: "border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20",
  abstain: "border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-900/20",
};

const DECISION_DOT: Record<string, string> = {
  for:     "bg-vote-for",
  against: "bg-vote-against",
  abstain: "bg-vote-abstain",
};

export function FactionVotePanel({ partyBreakdown, mkVotes = [], className }: FactionVotePanelProps) {
  const sorted = [...partyBreakdown]
    .filter((f) => f.for_count + f.against_count + f.abstain_count > 0)
    .sort((a, b) => (b.for_count + b.against_count + b.abstain_count) - (a.for_count + a.against_count + a.abstain_count));

  const mkByFaction = mkVotes.reduce<Record<number, MKVoteRecord[]>>((acc, mk) => {
    const fid = mk.faction_id ?? 0;
    if (!acc[fid]) acc[fid] = [];
    acc[fid].push(mk);
    return acc;
  }, {});

  const hasMkData = mkVotes.length > 0;

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-start px-3 py-2 font-semibold text-muted-foreground">סיעה</th>
            <th className="text-center px-2 py-2 font-semibold text-vote-for">בעד</th>
            <th className="text-center px-2 py-2 font-semibold text-vote-against">נגד</th>
            <th className="text-center px-2 py-2 font-semibold text-vote-abstain">נמנע</th>
            <th className="px-2 py-2 min-w-[80px]" />
            {hasMkData && <th className="px-2 py-2 w-8" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <FactionRow
              key={f.faction_id}
              faction={f}
              mks={mkByFaction[f.faction_id] ?? []}
              hasMkData={hasMkData}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FactionRow({
  faction,
  mks,
  hasMkData,
}: {
  faction: PartyVoteBreakdown;
  mks: MKVoteRecord[];
  hasMkData: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = faction.for_count + faction.against_count + faction.abstain_count;

  const decidedMks = mks.filter((m) => m.decision !== "absent");

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/50 last:border-0 transition-colors",
          hasMkData && decidedMks.length > 0 ? "hover:bg-muted/30 cursor-pointer" : ""
        )}
        onClick={() => hasMkData && decidedMks.length > 0 && setOpen((v) => !v)}
      >
        <td className="px-3 py-2 font-medium text-foreground max-w-[140px] truncate">
          {faction.faction_id === 0 ? "סיעות שונות / אחר" : (faction.faction_name || `סיעה ${faction.faction_id}`)}
        </td>
        <td className="text-center px-2 py-2">
          <span className={cn("font-semibold tabular-nums", faction.for_count > 0 ? "text-vote-for" : "text-muted-foreground/40")}>
            {faction.for_count}
          </span>
        </td>
        <td className="text-center px-2 py-2">
          <span className={cn("font-semibold tabular-nums", faction.against_count > 0 ? "text-vote-against" : "text-muted-foreground/40")}>
            {faction.against_count}
          </span>
        </td>
        <td className="text-center px-2 py-2">
          <span className={cn("font-semibold tabular-nums", faction.abstain_count > 0 ? "text-vote-abstain" : "text-muted-foreground/40")}>
            {faction.abstain_count}
          </span>
        </td>
        <td className="px-2 py-2">
          {active > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full border border-border/40">
              {faction.for_count > 0 && (
                <div style={{ width: `${(faction.for_count / active) * 100}%` }} className="bg-vote-for" />
              )}
              {faction.against_count > 0 && (
                <div style={{ width: `${(faction.against_count / active) * 100}%` }} className="bg-vote-against" />
              )}
              {faction.abstain_count > 0 && (
                <div style={{ width: `${(faction.abstain_count / active) * 100}%` }} className="bg-vote-abstain" />
              )}
            </div>
          )}
        </td>
        {hasMkData && (
          <td className="px-2 py-2 text-muted-foreground/50">
            {decidedMks.length > 0 && (
              open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
            )}
          </td>
        )}
      </tr>

      {open && decidedMks.length > 0 && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={hasMkData ? 6 : 5} className="px-3 py-3">
            <div className="flex flex-col gap-3">
              {["for", "against", "abstain"].map((decision) => {
                const group = decidedMks.filter((m) => m.decision === decision);
                if (group.length === 0) return null;
                return (
                  <div key={decision}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={cn("inline-block h-2 w-2 rounded-full", DECISION_DOT[decision])} />
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {DECISION_LABEL[decision]} · {group.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.map((mk, idx) => {
                        const chipBody = (
                          <>
                            <MKAvatar
                              name={mk.mk_name}
                              photoUrl={mk.mk_individual_photo}
                              seed={mk.mk_individual_id || idx}
                              size={24}
                            />
                            <div className="flex flex-col text-start leading-tight">
                              <span className="text-[11px] font-semibold text-foreground group-hover:text-primary">
                                {mk.mk_name}
                              </span>
                              {(faction.faction_id === 0 || faction.faction_id === null) && mk.faction_name && (
                                <span className="text-[9.5px] text-muted-foreground font-normal">
                                  {mk.faction_name}
                                </span>
                              )}
                            </div>
                          </>
                        );
                        const chipClass = cn(
                          "group inline-flex items-center gap-2 rounded-lg border bg-card ps-1.5 pe-3 py-1 transition-colors",
                          DECISION_CHIP[decision]
                        );
                        // Only link when we resolved a real member id; otherwise
                        // render a static chip so we never navigate to a 404.
                        return mk.mk_individual_id > 0 ? (
                          <Link
                            key={`${mk.mk_individual_id}-${idx}`}
                            href={`/members/${mk.mk_individual_id}`}
                            className={cn(chipClass, "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50")}
                            title={`${mk.mk_name} (${mk.faction_name || ''}) — לעמוד חבר/ת הכנסת`}
                          >
                            {chipBody}
                          </Link>
                        ) : (
                          <span key={`u-${idx}`} className={chipClass} title={`${mk.mk_name} (${mk.faction_name || ''})`}>
                            {chipBody}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
