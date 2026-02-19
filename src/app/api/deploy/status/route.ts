import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";

const BANKR_API_KEY = process.env.BANKR_API_KEY;
const BANKR_API_URL = "https://api.bankr.bot";

// GET /api/deploy/status?jobId=xxx&wallet=0x...&name=...&symbol=...
export async function GET(req: NextRequest) {
  if (!BANKR_API_KEY) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BANKR_API_URL}/agent/job/${jobId}`, {
      headers: { "X-API-Key": BANKR_API_KEY },
    });

    if (!res.ok) {
      return NextResponse.json({ status: "pending" });
    }

    const data = await res.json();

    if (data.status === "pending" || data.status === "processing") {
      return NextResponse.json({ status: "pending" });
    }

    if (data.status === "failed") {
      return NextResponse.json({ status: "failed", error: data.response || "Deploy failed on-chain" });
    }

    if (data.status === "completed") {
      const responseText = data.response || "";

      // Extract contract address
      const addrMatch = responseText.match(/0x[a-fA-F0-9]{40}/);
      const contractAddress = addrMatch ? addrMatch[0] : null;

      // Extract Doppler link
      const dopplerMatch = responseText.match(/https:\/\/app\.doppler\.lol\/[^\s)]+/);
      const dopplerUrl = dopplerMatch
        ? dopplerMatch[0]
        : contractAddress
          ? `https://app.doppler.lol/tokens/base/${contractAddress}`
          : null;

      // Extract Bankr link
      const bankrMatch = responseText.match(/https:\/\/bankr\.bot\/[^\s)]+/);
      const bankrUrl = bankrMatch ? bankrMatch[0] : null;

      // Log activity
      const wallet = req.nextUrl.searchParams.get("wallet");
      const name = req.nextUrl.searchParams.get("name");
      const symbol = req.nextUrl.searchParams.get("symbol");

      if (wallet) {
        logActivity(wallet.toLowerCase(), "token_deployed", {
          name,
          symbol,
          contractAddress,
          dopplerUrl,
          feeRecipient: wallet,
        }, "mememint");
      }

      return NextResponse.json({
        status: "completed",
        contractAddress,
        dopplerUrl,
        bankrUrl,
        basescanUrl: contractAddress ? `https://basescan.org/token/${contractAddress}` : null,
        feeRecipient: wallet,
        message: responseText,
      });
    }

    return NextResponse.json({ status: data.status || "unknown" });
  } catch (e) {
    console.error("Status check error:", e);
    return NextResponse.json({ status: "pending" });
  }
}
