import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton"; // Use Skeleton for loading state

interface FnameRenameFormProps {
    currentFname: string | null;
    isLoadingCurrentFname: boolean;
    newFname: string;
    setNewFname: (value: string) => void;
    onOpenConfirmation: () => void; // Callback to open the dialog - used by parent
    isLoading: boolean; // General loading state for the rename process
    isConnected: boolean;
    fid: number | null;
}

export function FnameRenameForm({
    currentFname,
    isLoadingCurrentFname,
    newFname,
    setNewFname,
    onOpenConfirmation,
    isLoading,
    isConnected,
    fid,
}: FnameRenameFormProps) {

    // Only render the form section if connected and FID is available
    if (!isConnected || !fid) {
        if (isConnected && !fid) {
            // Message handled by FarcasterInfoDisplay, return null here
            return null
        }
        // If not connected, show connection message (or handle in parent)
        return (
            <p className="text-center text-muted-foreground">
                Connect your wallet to manage your fname.
            </p>
        );
    }


    return (
        <>
            {/* Current Fname Display */}
            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="currentFname">Current Fname (Auto-detected)</Label>
                {isLoadingCurrentFname ? (
                    <Skeleton className="h-10 w-full" />
                ) : (
                    <Input
                        id="currentFname"
                        placeholder={!currentFname ? "No fname found" : ""}
                        value={currentFname ?? ""}
                        readOnly
                        className="bg-muted/50 border-dashed"
                    />
                )}
            </div>

            {/* New Fname Input */}
            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="newFname">New Fname</Label>
                <Input
                    id="newFname"
                    placeholder="e.g., vitalik"
                    value={newFname}
                    onChange={(e) => setNewFname(e.target.value.toLowerCase().trim())}
                    // Disable input if there's no current fname to change *from* or if rename is in progress
                    disabled={isLoading || !currentFname || isLoadingCurrentFname}
                />
                <p className="text-sm text-muted-foreground">
                    Enter your desired new Farcaster username (must be available).
                </p>
            </div>

            {/* Action Button logic is handled in the parent component's CardFooter */}

        </>
    );
} 