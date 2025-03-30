"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useWalletClient } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  executeFnameRename
} from "@/lib/farcasterUtils";
import { useFarcasterIdentity } from "@/hooks/useFarcasterIdentity"; // Import the custom hook
import { FarcasterInfoDisplay } from "@/components/FarcasterInfoDisplay"; // Import the display component
import { FnameRenameForm } from "@/components/FnameRenameForm"; // Import the form component
import { ConfirmationDialog } from "@/components/ConfirmationDialog"; // Import the dialog component

export default function Home() {
  const {
    address,
    isConnected,
    fid,
    currentFname,
    isLoadingFid,
    isLoadingCurrentFname,
    fidError
  } = useFarcasterIdentity();

  const { data: walletClient } = useWalletClient(); // Get the Viem WalletClient
  const [newFname, setNewFname] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Combined loading state for rename process
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  // Removed FID fetching logic (now in hook)
  // Removed Current Fname fetching logic (now in hook)
  // Removed generateSignature function (now in utils)

  // Validation logic remains here or could be moved to utils if complex
  const validateNewFname = (fname: string): boolean => {
    if (!fname) {
      toast.error("Please enter your desired new Farcaster username.");
      return false;
    }
    if (currentFname === fname) {
      toast.error("New username cannot be the same as the current one.");
      return false;
    }
    const fnameRegex = /^[a-z0-9][a-z0-9-]{0,15}$/;
    if (!fnameRegex.test(fname) || fname.startsWith('-') || fname.endsWith('-')) {
      toast.error("New username contains invalid characters, is too long (max 16), or starts/ends with a hyphen.");
      return false;
    }
    return true;
  }

  // Rename logic, now using the utility function from lib
  const handleActualRename = async () => {
    if (!isConnected || !address || !fid || !currentFname || !walletClient || !newFname) {
      toast.error("Missing required information. Please ensure wallet is connected and details loaded.");
      setIsLoading(false);
      setIsConfirmDialogOpen(false);
      return;
    }

    setIsLoading(true);
    toast.info(`Starting rename: ${currentFname} -> ${newFname}...`);

    try {
      // Call the utility function to perform the core logic
      toast.info("Checking availability and preparing signatures...");
      // Note: Signature prompts will happen inside executeFnameRename
      const success = await executeFnameRename(
        currentFname,
        newFname,
        fid,
        address,
        walletClient
      );

      if (success) {
        toast.success(`Successfully renamed ${currentFname} to ${newFname}!`);
        setNewFname(""); // Clear input on success
        // TODO: Implement or call a refetch function from useFarcasterIdentity hook
        // to update the displayed current fname.
      }
      // If executeFnameRename fails, it throws an error which is caught below.

    } catch (error: unknown) {
      console.error("Rename process failed:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      // Error message from executeFnameRename might indicate partial success/failure
      toast.error(`Rename failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setIsConfirmDialogOpen(false);
    }
  };

  // Removed handleConfirmRename (logic moved into ConfirmationDialog)
  // Removed confirmationInput and confirmationError states (now in ConfirmationDialog)

  // Handler to open the dialog - performs preliminary checks
  const openConfirmationDialog = () => {
    // Use state from hook for checks
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (isLoadingFid || !fid) {
      toast.error(isLoadingFid ? "Still determining your FID..." : (fidError || "Could not determine your FID."));
      return;
    }
    if (isLoadingCurrentFname) {
      toast.error("Still fetching your current fname...");
      return;
    }
    if (!currentFname) {
      // Check fidError first to provide a more specific message if available
      if (fidError) {
        toast.error(fidError);
      } else {
        toast.error(`Your FID (${fid}) does not seem to have an fname assigned.`);
      }
      return;
    }
    // Validate the entered newFname before opening dialog
    if (!validateNewFname(newFname)) {
      return; // Validation failed, toast shown in validate function
    }

    // If all checks pass, open the dialog
    setIsConfirmDialogOpen(true);
  };


  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Farcaster Fname Renamer</CardTitle>
          <CardDescription>Connect your wallet and rename your Farcaster username (fname).</CardDescription>
          <div className="pt-4 flex justify-center">
            <ConnectKitButton />
          </div>
          {/* Display FID/Fname Info using the new component */}
          <FarcasterInfoDisplay
            isConnected={isConnected}
            isLoadingFid={isLoadingFid}
            fid={fid}
            fidError={fidError} // Pass fidError to display component
            isLoadingCurrentFname={isLoadingCurrentFname}
            currentFname={currentFname}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Use the FnameRenameForm component */}
          <FnameRenameForm
            currentFname={currentFname}
            isLoadingCurrentFname={isLoadingCurrentFname}
            newFname={newFname}
            setNewFname={setNewFname}
            isLoading={isLoading || isLoadingFid || isLoadingCurrentFname} // Pass combined loading state
            isConnected={isConnected}
            fid={fid}
          />
        </CardContent>
        {/* Footer is only shown if form is potentially interactive */}
        {isConnected && fid && (
          <CardFooter className="flex flex-col items-center gap-2 pt-4">
            <Button
              className="w-full"
              onClick={openConfirmationDialog} // Button now just opens the dialog
              // Simplified disabled logic: depends on ability to initiate the action
              disabled={
                isLoading || // Any loading happening?
                isLoadingFid ||
                isLoadingCurrentFname ||
                !currentFname || // No current name to change from?
                !newFname || // New name entered?
                newFname === currentFname // New name same as old?
              }
            >
              Rename Fname
            </Button>
            <p className="text-xs text-muted-foreground text-center px-4">
              This will rename <code className="font-semibold">{currentFname ?? 'your fname'}</code> to <code className="font-semibold">{newFname || '...'}</code>. Requires confirmation and two signatures.
            </p>
          </CardFooter>
        )}
      </Card>

      <ConfirmationDialog
        isOpen={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        currentFname={currentFname}
        newFname={newFname}
        onConfirm={handleActualRename}
        isLoading={isLoading}
      />

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        Built by <a href="https://twitter.com/itzlambda" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">itzlambda</a>
      </footer>
    </main>
  );
}
