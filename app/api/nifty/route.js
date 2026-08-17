export async function GET() {
    try {
        const res = await fetch(
            "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1m",
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                next: { revalidate: 5 },
            }
        );

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        const result = data.chart?.result?.[0];
        if (!result) {
            throw new Error("No chart result found");
        }

        const meta = result.meta;
        const ltp = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose;
        const open = meta.regularMarketDayLow ? result.indicators?.quote?.[0]?.open?.[0] || ltp : ltp;
        const high = meta.regularMarketDayHigh || ltp;
        const low = meta.regularMarketDayLow || ltp;
        const change = ltp - prevClose;
        const changePct = prevClose ? (change / prevClose) * 100 : 0;

        return Response.json({
            success: true,
            symbol: "NIFTY 50",
            ltp: Number(ltp.toFixed(2)),
            open: Number((open || ltp).toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            prevClose: Number(prevClose.toFixed(2)),
            change: Number(change.toFixed(2)),
            changePct: Number(changePct.toFixed(2)),
            lastUpdated: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
        });
    } catch (error) {
        console.error("Live API route error:", error);
        return Response.json(
            {
                success: false,
                error: error.message,
            },
            { status: 500 }
        );
    }
}
