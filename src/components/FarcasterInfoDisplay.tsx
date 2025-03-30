import React from 'react';
import { Skeleton } from "@/components/ui/skeleton"; // Assuming Skeleton is available

interface FarcasterInfoDisplayProps {
    isConnected: boolean;
    isLoadingFid: boolean;
    fid: number | null;
    fidError: string | null;
    isLoadingCurrentFname: boolean;
    currentFname: string | null;
}

export function FarcasterInfoDisplay({
    isConnected,
    isLoadingFid,
    fid,
    fidError,
    isLoadingCurrentFname,
    currentFname,
}: FarcasterInfoDisplayProps) {

    if (!isConnected) {
        return null; // Don't display anything if not connected
    }

    return (
        <div className="text-center text-xs text-muted-foreground mt-3 space-y-1 px-4">
            {/* FID Loading/Error/Display */}
            {isLoadingFid && <Skeleton className="h-4 w-24 mx-auto" /> /* Loading FID... */}
            {!isLoadingFid && fidError && <p className="text-red-500">{fidError}</p>}
            {!isLoadingFid && fid && !fidError && <p>Connected as FID: {fid}</p>}

            {/* Fname Loading/Display */}
            {fid && isLoadingCurrentFname && <Skeleton className="h-4 w-32 mx-auto" /> /* Loading current fname... */}
            {fid && !isLoadingCurrentFname && currentFname && (
                <p>Current Fname: <code className="font-semibold">{currentFname}</code></p>
            )}
            {fid && !isLoadingCurrentFname && !currentFname && !fidError && ( // Only show if FID is valid but no fname
                <p className="text-orange-500">Your FID ({fid}) does not have an fname assigned.</p>
            )}
        </div>
    );
} 