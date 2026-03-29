/**
 * PATCH /api/filings/peer
 * Body: { ticker: string, peerType: PeerType }
 *
 * Update the peer type for a company.
 */

import { setCompanyPeerType } from "@/lib/filingStorage";
import type { PeerType } from "@/types/competitor";

export const runtime = "nodejs";

const VALID_PEER_TYPES: PeerType[] = [
  "subject",
  "packaged-meats",
  "pork-fresh",
  "diversified-protein",
  "methodology-change",
  "spinoff-structural",
];

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ticker, peerType } = body as { ticker?: string; peerType?: string };

    if (!ticker || !peerType) {
      return Response.json(
        { error: "Missing ticker or peerType" },
        { status: 400 }
      );
    }

    if (!VALID_PEER_TYPES.includes(peerType as PeerType)) {
      return Response.json(
        { error: `Invalid peerType: ${peerType}` },
        { status: 400 }
      );
    }

    const company = await setCompanyPeerType(
      ticker.toUpperCase(),
      peerType as PeerType
    );

    if (!company) {
      return Response.json(
        { error: `Company ${ticker} not found in registry` },
        { status: 404 }
      );
    }

    return Response.json(company);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
