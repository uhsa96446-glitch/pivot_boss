import "./globals.css";

export const viewport = {
    themeColor: "#08090c",
    width: "device-width",
    initialScale: 1,
};

export const metadata = {
    title: "Pivot-Boss — Strategy-Driven Market Profile & CPR Dashboard",
    description:
        "Real-time strategy-driven Market Profile and Central Pivot Range (CPR) decision engine for NIFTY 50 trading based on PivotBoss framework.",
    keywords: [
        "NIFTY 50",
        "PivotBoss",
        "Central Pivot Range",
        "CPR Trading",
        "Market Profile",
        "Trading Dashboard",
    ],
    authors: [{ name: "Gopal Das" }],
    robots: "index, follow",
    manifest: "/manifest.json",
    openGraph: {
        title: "Pivot-Boss",
        description: "PivotBoss-aligned context, location, and execution framework for NIFTY 50.",
        type: "website",
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <meta name="description" content="Real-time strategy-driven Market Profile and Central Pivot Range (CPR) decision engine for NIFTY 50 trading based on PivotBoss framework." />
                <title>Pivot-Boss — Strategy-Driven Market Profile & CPR Dashboard</title>
            </head>
            <body>{children}</body>
        </html>
    );
}

