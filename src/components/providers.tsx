"use client";

import * as React from "react";
import { WagmiProvider, createConfig } from "wagmi";
import { mainnet, optimism, base, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient();

// Get WalletConnect Project ID from environment variables
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
    throw new Error(
        "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set in .env.local"
    );
}

// Define chains
const chains = [optimism, mainnet] as const;

// Create wagmi config using ConnectKit's getDefaultConfig
const config = createConfig(
    getDefaultConfig({
        appName: "Farcaster Fname Rename",
        walletConnectProjectId: projectId,
        chains: chains,

        // Optional App Info
        appDescription: "Rename your Farcaster username (fname)",
        appUrl: "https://example.com", // TODO: Replace with your actual app URL
        appIcon: "/logo.png", // TODO: Add a logo image if you have one
    }),
);

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <ConnectKitProvider theme="auto"> {/* You can customize theme: "light", "dark", "auto" */}
                    {children}
                    <Toaster />
                </ConnectKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
} 