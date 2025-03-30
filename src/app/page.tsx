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
  isUsernameTaken,
  generateSignature,
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

  // Rename logic, now using state from the hook
  const handleActualRename = async () => {
    // Double-check necessary conditions before proceeding (belt and suspenders)
    if (!isConnected || !address || !fid || !currentFname || !walletClient || !newFname) {
      toast.error("Missing required information to rename. Please ensure wallet is connected and details are loaded.");
      setIsLoading(false); // Ensure loading state is reset
      setIsConfirmDialogOpen(false); // Close dialog if somehow open
      return;
    }

    // Validation is also done inside ConfirmationDialog before calling this,
    // but can be re-checked here if needed.

    setIsLoading(true);
    toast.info(`Starting rename process for ${currentFname} -> ${newFname} (FID: ${fid})...`);

    try {
      // 1. Check if newFname is available
      toast.info(`Checking availability of ${newFname}...`);
      const isTaken = await isUsernameTaken(newFname);
      if (isTaken) {
        throw new Error(`Username "${newFname}" is already taken.`);
      }
      toast.success(`${newFname} is available!`);

      // 2. Generate signature to delete currentFname
      toast.info(`Please sign the request to release ${currentFname}...`);
      const deleteTimestamp = Math.floor(Date.now() / 1000);
      const deleteSignatureData = await generateSignature(
        currentFname,
        address,
        deleteTimestamp,
        walletClient // Pass walletClient
      );
      toast.success(`Release signature obtained for ${currentFname}.`);

      // 3. Generate signature to register newFname
      toast.info(`Please sign the request to claim ${newFname}...`);
      const preRegisterTime = Date.now();
      let registerTimestamp = Math.max(deleteTimestamp + 1, Math.floor(preRegisterTime / 1000));
      if (registerTimestamp === deleteTimestamp) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Ensure distinct timestamp
        registerTimestamp = Math.floor(Date.now() / 1000);
      }

      const registerSignatureData = await generateSignature(
        newFname,
        address,
        registerTimestamp,
        walletClient // Pass walletClient
      );
      toast.success(`Claim signature obtained for ${newFname}.`);

      // 4. Call backend API to execute transfers
      toast.info("Submitting rename request...");
      const response = await fetch("/api/rename", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentFname: currentFname, // Use state from hook
          newFname,
          fid: fid, // Use state from hook
          owner: address, // Use state from hook
          deleteSignature: deleteSignatureData.signature,
          deleteTimestamp: deleteSignatureData.timestamp,
          registerSignature: registerSignatureData.signature,
          registerTimestamp: registerTimestamp,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }

      toast.success(`Successfully renamed ${currentFname} to ${newFname}! FID: ${fid}`);
      // TODO: Trigger re-fetch of currentFname from the hook instead of manually setting state
      // For now, we can clear the input, but ideally the hook refetches.
      setNewFname("");
      // The hook `useFarcasterIdentity` will automatically refetch the fname when `fid` changes,
      // but since `fid` doesn't change here, we might need a manual refetch trigger in the hook.
      // Or, update the state optimistically (less ideal if backend fails later).
      // Let's leave it for now; user might need to refresh for UI update.


    } catch (error: unknown) {
      console.error("Rename failed:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast.error(`Rename failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setIsConfirmDialogOpen(false); // Close dialog regardless of success/failure
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
            onOpenConfirmation={openConfirmationDialog} // Pass handler to open dialog
            isLoading={isLoading || isLoadingFid || isLoadingCurrentFname} // Pass combined loading state
            isConnected={isConnected}
            fid={fid}
          />
          {!isConnected && (
            <p className="text-center text-muted-foreground pt-4">
              Connect your wallet to manage your fname.
            </p>
          )}
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

      {/* Confirmation Dialog - Pass necessary props */}
      {/* Removed console.log causing linter error */}
      <ConfirmationDialog
        isOpen={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        currentFname={currentFname}
        newFname={newFname}
        onConfirm={handleActualRename} // Pass the actual rename function
        isLoading={isLoading} // Pass the specific loading state for the rename API calls/signatures
      />

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        Built by <a href="https://twitter.com/itzlamba" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">itzlambda</a>
      </footer>
    </main>
  );
}
