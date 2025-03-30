"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useReadContract, useWalletClient } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Hex, bytesToHex } from "viem";
import { ID_REGISTRY_ADDRESS, idRegistryABI } from "@/lib/constants"; // Use local constants
import {
  makeUserNameProofClaim,
  ViemWalletEip712Signer,
} from "@farcaster/hub-web";
import React from "react"; // Import React for useEffect
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger, // We might not need Trigger if we control open state manually
} from "@/components/ui/dialog";

// Type for individual transfer object from fname server
type FnameTransfer = {
  id: number;
  timestamp: number;
  username: string;
  owner: Hex;
  from: number;
  to: number;
  user_signature: Hex;
  server_signature: Hex;
};

// Type for the fname server response when querying by name
type FnameTransferResponse = {
  transfer: FnameTransfer;
} | { transfers: [] };

// Type for the fname server response when querying by FID
type FnameTransfersResponse = {
  transfers: FnameTransfer[];
};


// --- Helper Functions ---

// Function to get the current fname associated with an FID
async function getCurrentFnameFromFid(fid: number): Promise<string | null> {
  if (fid <= 0) return null; // Invalid FID

  try {
    const response = await fetch(`https://fnames.farcaster.xyz/transfers?fid=${fid}`);
    if (!response.ok) {
      // Handle cases like 404 Not Found if the FID somehow isn't in their system
      if (response.status === 404) {
        console.warn(`Fname server returned 404 for FID ${fid}.`);
        return null;
      }
      throw new Error(`Failed to fetch transfers for FID ${fid} (status ${response.status})`);
    }
    const data: FnameTransfersResponse = await response.json();

    if (!data.transfers || data.transfers.length === 0) {
      console.log(`No transfers found for FID ${fid}.`);
      return null; // No transfers found for this FID
    }

    // Sort transfers by timestamp descending (most recent first)
    const sortedTransfers = data.transfers.sort((a, b) => b.timestamp - a.timestamp);

    // Check the absolute latest transfer involving this FID
    const latestTransfer = sortedTransfers[0];
    if (latestTransfer.from === fid && latestTransfer.to === 0) {
      // The latest action was the FID deleting a name
      console.log(`FID ${fid} last action was deleting ${latestTransfer.username}. No current fname.`);
      return null;
    }

    // Find the latest transfer *to* this FID
    const latestRegistration = sortedTransfers.find(t => t.to === fid);

    if (latestRegistration) {
      console.log(`Found current fname for FID ${fid}: ${latestRegistration.username}`);
      return latestRegistration.username;
    } else {
      // This case might happen if the FID only ever transferred names *away*
      // but never received one, which seems unlikely for typical users.
      console.log(`Could not find a registration transfer to FID ${fid} in history.`);
      return null;
    }

  } catch (error) {
    console.error(`Error fetching current fname for FID ${fid}:`, error);
    throw error; // Re-throw to be caught by the calling useEffect
  }
}


async function isUsernameTaken(username: string): Promise<boolean> {
  try {
    const response = await fetch(`https://fnames.farcaster.xyz/transfers?name=${username.toLowerCase()}`);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`Failed to check username availability (status ${response.status})`);
    }
    // Use FnameTransferResponse which expects either 'transfer' or 'transfers: []'
    const data: FnameTransferResponse = await response.json();
    // If 'transfer' exists, it means the name has *some* record.
    // We need to check if the 'to' field in that record is non-zero, indicating it's currently assigned.
    return ('transfer' in data && data.transfer.to !== 0);
  } catch (error) {
    console.error("Error checking username availability:", error);
    throw error;
  }
}


export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient(); // Get the Viem WalletClient
  const [newFname, setNewFname] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFid, setIsLoadingFid] = useState(true); // Loading state for FID fetch
  const [isLoadingCurrentFname, setIsLoadingCurrentFname] = useState(false); // Loading state for fname fetch
  const [fetchedFid, setFetchedFid] = useState<number | null>(null);
  const [fetchedCurrentFname, setFetchedCurrentFname] = useState<string | null>(null); // State for fetched fname
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false); // State for dialog visibility
  const [confirmationInput, setConfirmationInput] = useState(""); // State for confirmation input
  const [confirmationError, setConfirmationError] = useState<string | null>(null); // State for confirmation error message


  // --- Fetch FID ---
  const { data: fidBigInt, error: errorFid } = useReadContract({
    address: ID_REGISTRY_ADDRESS,
    abi: idRegistryABI,
    functionName: 'idOf',
    args: [address as Hex],
    chainId: 10,
    query: {
      enabled: !!address,
    }
  });

  // Process FID result
  React.useEffect(() => {
    setIsLoadingFid(!address || (fidBigInt === undefined && !errorFid)); // More robust loading state
    if (fidBigInt !== undefined && fidBigInt !== null) {
      const fidNumber = Number(fidBigInt);
      setFetchedFid(fidNumber === 0 ? null : fidNumber);
    } else {
      setFetchedFid(null);
    }
  }, [fidBigInt, address, errorFid]);


  // --- Fetch Current Fname using FID ---
  React.useEffect(() => {
    // Only run if we have a valid FID
    if (fetchedFid && fetchedFid > 0) {
      setIsLoadingCurrentFname(true);
      setFetchedCurrentFname(null); // Reset previous fname if FID changes
      let isMounted = true; // Prevent state update on unmounted component

      getCurrentFnameFromFid(fetchedFid)
        .then(fname => {
          if (isMounted) {
            setFetchedCurrentFname(fname);
          }
        })
        .catch(error => {
          // Already logged in the function, maybe show toast?
          console.error("Failed to fetch current fname:", error);
          if (isMounted) {
            toast.error(`Failed to fetch current fname: ${error.message}`);
            setFetchedCurrentFname(null); // Ensure it's null on error
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingCurrentFname(false);
          }
        });

      return () => { isMounted = false; }; // Cleanup function
    } else {
      // Reset if FID becomes null or invalid
      setFetchedCurrentFname(null);
      setIsLoadingCurrentFname(false);
    }
  }, [fetchedFid]); // Dependency on fetchedFid


  const generateSignature = async (
    fname: string,
    owner: Hex,
    timestamp: number // Input is seconds
  ): Promise<{ signature: Hex; timestamp: number }> => {
    // Check for wallet client first
    if (!walletClient) {
      throw new Error("Wallet client not available.");
    }

    // Use makeUserNameProofClaim from the SDK
    // Let makeUserNameProofClaim handle validation and return the correct type
    // It expects timestamp as number/bigint according to some sources, but EIP712 uses uint256 (bigint)
    // Linter error indicates it expects number input.
    const claim = makeUserNameProofClaim({
      name: fname,
      timestamp: timestamp, // Pass number directly as indicated by linter
      owner: owner,
    });

    // Instantiate the signer
    walletClient.switchChain({
      id: 1,
    });
    const eip712Signer = new ViemWalletEip712Signer(walletClient);

    // If makeUserNameProofClaim failed (returned an error object, though docs suggest it throws)
    // We might need error handling if it *doesn't* throw but returns a Result type
    // Assuming it throws for now based on common patterns

    try {
      // Use the signer to sign the claim
      // This returns a Result object, so we need to handle success/error
      const signResult = await eip712Signer.signUserNameProofClaim(claim);

      if (signResult.isErr()) {
        // Handle signature error
        console.error("Signature failed:", signResult.error);
        let errorMessage = "Failed to sign the message.";
        // Check for user rejection specifically
        if (signResult.error.message.includes("rejected") || signResult.error.message.includes("4001")) {
          errorMessage = "Signature request rejected by user.";
        }
        throw new Error(errorMessage + `: ${signResult.error.message}`); // Include original error
      }

      // Signature successful, get the value
      const signatureBytes = signResult.value;
      const signatureHex = bytesToHex(signatureBytes); // Convert Uint8Array to Hex

      return { signature: signatureHex, timestamp }; // Return original number timestamp
    } catch (error) {
      console.error("Signature failed:", error); // Log the original error object
      let errorMessage = "Failed to sign the message.";
      let detail = "";

      if (error instanceof Error) {
        detail = error.message; // Get message from standard Error object
      }

      // Check for specific wallet error codes (like user rejection)
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const errorCode = (error as { code: unknown }).code;
        if (errorCode === 4001 || errorCode === 'ACTION_REJECTED') {
          errorMessage = "Signature request rejected by user.";
          detail = ""; // Don't include generic detail if user rejected
        }
      }

      // Construct the final error message
      const finalErrorMessage = detail ? `${errorMessage}: ${detail}` : errorMessage;
      throw new Error(finalErrorMessage); // Throw the more detailed error
    }
  };


  const handleRename = async () => {
    // Check connection, address, FID, and *fetched* current fname
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (!fetchedFid) {
      toast.error(isLoadingFid ? "Still determining your FID..." : "Could not determine your FID.");
      return;
    }
    if (isLoadingCurrentFname) {
      toast.error("Still fetching your current fname...");
      return;
    }
    if (!fetchedCurrentFname) {
      toast.error("Could not fetch your current Farcaster username. Your FID might not have one assigned.");
      return;
    }
    if (!newFname) {
      toast.error("Please enter your desired new Farcaster username.");
      return;
    }
    if (fetchedCurrentFname === newFname) {
      toast.error("New username cannot be the same as the current one.");
      return;
    }
    // Basic validation for fname
    const fnameRegex = /^[a-z0-9][a-z0-9-]{0,15}$/;
    if (!fnameRegex.test(newFname)) {
      toast.error("New username contains invalid characters or is too long (max 16, alphanumeric, hyphen, cannot start/end with hyphen).");
      return;
    }
    if (newFname.startsWith('-') || newFname.endsWith('-')) {
      toast.error("New username cannot start or end with a hyphen.");
      return;
    }

    setIsLoading(true);
    toast.info(`Starting rename process for ${fetchedCurrentFname} -> ${newFname} (FID: ${fetchedFid})...`);

    try {
      // 1. Check if newFname is available (no change)
      toast.info(`Checking availability of ${newFname}...`);
      const isTaken = await isUsernameTaken(newFname);
      if (isTaken) {
        // Close the dialog if it was somehow left open? Or just show toast.
        setIsConfirmDialogOpen(false);
        throw new Error(`Username "${newFname}" is already taken.`);
      }
      toast.success(`${newFname} is available!`);

      // 2. Generate signature to delete currentFname (use fetchedCurrentFname)
      toast.info(`Please sign the request to release ${fetchedCurrentFname}...`);
      const deleteTimestamp = Math.floor(Date.now() / 1000);
      const deleteSignatureData = await generateSignature(
        fetchedCurrentFname!, // Assert non-null as it's checked before confirmation
        address!, // Assert non-null as it's checked before confirmation
        deleteTimestamp
      );
      toast.success(`Release signature obtained for ${fetchedCurrentFname}.`);

      // 3. Generate signature to register newFname (no change)
      toast.info(`Please sign the request to claim ${newFname}...`);
      // Ensure registerTimestamp is always >= deleteTimestamp
      const preRegisterTime = Date.now();
      let registerTimestamp = Math.max(deleteTimestamp + 1, Math.floor(preRegisterTime / 1000));
      // Optional: Small delay if timestamps are identical due to fast execution
      if (registerTimestamp === deleteTimestamp) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Wait 10ms
        registerTimestamp = Math.floor(Date.now() / 1000);
      }

      const registerSignatureData = await generateSignature(
        newFname,
        address!, // Assert non-null
        registerTimestamp
      );
      toast.success(`Claim signature obtained for ${newFname}.`);


      // 4. Call backend API to execute transfers (use fetchedFid and fetchedCurrentFname)
      toast.info("Submitting rename request...");
      const response = await fetch("/api/rename", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentFname: fetchedCurrentFname, // Use fetched name
          newFname,
          fid: fetchedFid, // Use fetched FID
          owner: address, // Use fetched address
          deleteSignature: deleteSignatureData.signature,
          deleteTimestamp: deleteSignatureData.timestamp,
          registerSignature: registerSignatureData.signature,
          registerTimestamp: registerSignatureData.timestamp,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }

      toast.success(`Successfully renamed ${fetchedCurrentFname} to ${newFname}! FID: ${fetchedFid}`);
      // Update fetched name state and clear new name input
      setFetchedCurrentFname(newFname);
      setNewFname("");
      setConfirmationInput(""); // Clear confirmation input on success
      setConfirmationError(null);

    } catch (error: unknown) {
      console.error("Rename failed:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during the rename process.";
      toast.error(`Rename failed: ${errorMessage}`);
      setConfirmationError(null); // Clear confirmation error on failure
    } finally {
      setIsLoading(false);
      setIsConfirmDialogOpen(false); // Ensure dialog closes on success/failure
    }
  };

  // New handler for the button inside the confirmation dialog
  const handleConfirmRename = () => {
    setConfirmationError(null); // Clear previous error
    const requiredPhrase = `change username to ${newFname}`.toLowerCase();
    if (confirmationInput.toLowerCase() === requiredPhrase) {
      // Phrase matches, proceed with the actual rename logic
      setIsConfirmDialogOpen(false); // Close the dialog
      handleRename(); // Call the original rename function
    } else {
      // Phrase does not match, show an error
      setConfirmationError("Confirmation text does not match. Please type it exactly as shown.");
    }
  };

  // Handler to open the dialog
  const openConfirmationDialog = () => {
    // Perform preliminary checks before opening the dialog
    if (!isConnected || !address) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (!fetchedFid) {
      toast.error(isLoadingFid ? "Still determining your FID..." : "Could not determine your FID.");
      return;
    }
    if (isLoadingCurrentFname) {
      toast.error("Still fetching your current fname...");
      return;
    }
    if (!fetchedCurrentFname) {
      toast.error("Could not fetch your current Farcaster username. Your FID might not have one assigned.");
      return;
    }
    if (!newFname) {
      toast.error("Please enter your desired new Farcaster username.");
      return;
    }
    if (fetchedCurrentFname === newFname) {
      toast.error("New username cannot be the same as the current one.");
      return;
    }
    // Basic validation for fname
    const fnameRegex = /^[a-z0-9][a-z0-9-]{0,15}$/;
    if (!fnameRegex.test(newFname)) {
      toast.error("New username contains invalid characters or is too long (max 16, alphanumeric, hyphen, cannot start/end with hyphen).");
      return;
    }
    if (newFname.startsWith('-') || newFname.endsWith('-')) {
      toast.error("New username cannot start or end with a hyphen.");
      return;
    }

    // If all checks pass, open the dialog
    setConfirmationInput(""); // Reset input field
    setConfirmationError(null); // Reset error
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
          {/* Display FID/Fname Info */}
          {isConnected && (
            <div className="text-center text-xs text-muted-foreground mt-3 space-y-1 px-4">
              {isLoadingFid && <p>Loading FID...</p>}
              {errorFid && <p className="text-red-500">Error loading FID: {errorFid.message.split('Args:')[0]}</p>} {/* Trim error */}
              {fetchedFid && <p>Connected as FID: {fetchedFid}</p>}
              {!isLoadingFid && !errorFid && address && !fetchedFid && (
                <p className="text-orange-500">Connected address does not own a Farcaster ID.</p>
              )}
              {fetchedFid && isLoadingCurrentFname && <p>Loading current fname...</p>}
              {fetchedFid && !isLoadingCurrentFname && fetchedCurrentFname && (
                <p>Current Fname: <code className="font-semibold">{fetchedCurrentFname}</code></p>
              )}
              {fetchedFid && !isLoadingCurrentFname && !fetchedCurrentFname && (
                <p className="text-orange-500">Your FID ({fetchedFid}) does not have an fname assigned.</p>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && fetchedFid && ( // Only show inputs if connected and has FID
            <>
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="currentFname">Current Fname (Auto-detected)</Label>
                <Input
                  id="currentFname"
                  placeholder={isLoadingCurrentFname ? "Loading..." : "No fname found"}
                  value={fetchedCurrentFname ?? ""} // Display fetched name or empty string
                  readOnly // Make read-only
                  className="bg-muted/50 border-dashed" // Style as read-only
                />
              </div>
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="newFname">New Fname</Label>
                <Input
                  id="newFname"
                  placeholder="e.g., vitalik"
                  value={newFname}
                  onChange={(e) => setNewFname(e.target.value.toLowerCase().trim())}
                  disabled={isLoading || !fetchedCurrentFname} // Disable if no current fname or loading
                />
                <p className="text-sm text-muted-foreground">
                  Enter your desired new Farcaster username (must be available).
                </p>
              </div>
            </>
          )}
          {!isConnected && (
            <p className="text-center text-muted-foreground">
              Connect your wallet to manage your fname.
            </p>
          )}
          {isConnected && !fetchedFid && !isLoadingFid && (
            <p className="text-center text-muted-foreground">
              Please connect a wallet that owns a Farcaster ID.
            </p>
          )}
        </CardContent>
        {isConnected && fetchedFid && ( // Only show footer button if connected and has FID
          <CardFooter className="flex flex-col items-center gap-2">
            <Button
              className="w-full"
              onClick={openConfirmationDialog} // Changed onClick here
              // Keep existing disabled conditions - maybe refine?
              disabled={isLoading || isLoadingFid || isLoadingCurrentFname || !fetchedCurrentFname || !newFname}
            >
              {/* Keep button text simple, action happens after dialog */}
              Rename Fname
            </Button>
            <p className="text-xs text-muted-foreground text-center px-4">
              This will rename <code className="font-semibold">{fetchedCurrentFname ?? 'your fname'}</code> to <code className="font-semibold">{newFname || '...'}</code>. Requires confirmation and two signatures.
            </p>
          </CardFooter>
        )}
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Fname Change</DialogTitle>
            <DialogDescription className="pt-2">
              You are about to change your Farcaster username from
              <strong className="px-1">{fetchedCurrentFname}</strong> to
              <strong className="px-1 text-lg">{newFname}</strong>.
              <br />
              This action requires two signatures and is processed via the fname server.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid items-center gap-1.5">
              <Label htmlFor="confirmationText" className="text-left pb-1">
                To confirm, please type the following exactly:
                <br />
                <code className="text-sm font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                  {/* Display required phrase - ensure newFname is not empty */}
                  change username to {newFname || '...'}
                </code>
              </Label>
              <Input
                id="confirmationText"
                value={confirmationInput}
                onChange={(e) => {
                  setConfirmationInput(e.target.value);
                  // Clear error message as user types
                  if (confirmationError) setConfirmationError(null);
                }}
                placeholder={`Type the phrase above`}
                className={confirmationError ? "border-red-500" : ""} // Highlight if error
                disabled={isLoading} // Disable input while rename is in progress
              />
              {confirmationError && (
                <p className="text-sm text-red-500 pt-1">{confirmationError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="button" // Use type="button" to prevent form submission if wrapped in form later
              onClick={handleConfirmRename}
              // Disable confirm button if input doesn't match (case-insensitive) or if loading
              disabled={
                isLoading ||
                confirmationInput.toLowerCase() !== `change username to ${newFname}`.toLowerCase()
              }
            >
              {isLoading ? "Processing..." : "Confirm Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        Built by <a href="https://twitter.com/itzlamba" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">itzlambda</a>
      </footer>
    </main>
  );
}
