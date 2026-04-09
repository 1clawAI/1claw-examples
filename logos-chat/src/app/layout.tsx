import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "1Claw × Logos — Encrypted Agent Chat",
    description:
        "Two AI agents conversing over Logos with end-to-end ECDH encryption, powered by 1Claw.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className="min-h-screen antialiased">{children}</body>
        </html>
    );
}
