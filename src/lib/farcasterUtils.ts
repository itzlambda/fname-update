import { Hex, bytesToHex } from "viem";
import { ViemWalletEip712Signer, makeUserNameProofClaim } from "@farcaster/hub-web";
import { WalletClient } from "viem"; // Import WalletClient type
import { mainnet } from "viem/chains";

// Type for individual transfer object from fname server
export type FnameTransfer = {
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
export type FnameTransferResponse = {
  transfer: FnameTransfer;
} | { transfers: [] };

// Type for the fname server response when querying by FID
export type FnameTransfersResponse = {
  transfers: FnameTransfer[];
};

// Function to get the current fname associated with an FID
export async function getCurrentFnameFromFid(fid: number): Promise<string | null> {
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
    throw error; // Re-throw to be caught by the calling function
  }
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  try {
    const response = await fetch(`https://fnames.farcaster.xyz/transfers?name=${username.toLowerCase()}`);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`Failed to check username availability (status ${response.status})`);
    }
    const data: FnameTransferResponse = await response.json();
    return ('transfer' in data && data.transfer.to !== 0);
  } catch (error) {
    console.error("Error checking username availability:", error);
    throw error;
  }
}

export const generateSignature = async (
  fname: string,
  owner: Hex,
  timestamp: number, // Input is seconds
  walletClient: WalletClient // Accept walletClient as argument
): Promise<{ signature: Hex; timestamp: number }> => {
  if (!walletClient) {
    throw new Error("Wallet client not provided.");
  }

  const claim = makeUserNameProofClaim({
    name: fname,
    timestamp: timestamp,
    owner: owner,
  });

  // Instantiate the signer
  // Ensure the wallet is on the correct chain (Mainnet for Farcaster ID registry interactions)
  // Consider making chain switching more robust or checking current chain if necessary
  // await walletClient.switchChain({ id: 1 }); // Switching chain here might be disruptive, caller should ensure correct chain.

  walletClient.switchChain({ id: mainnet.id });
  const eip712Signer = new ViemWalletEip712Signer(walletClient);

  try {
    const signResult = await eip712Signer.signUserNameProofClaim(claim);

    if (signResult.isErr()) {
      console.error("Signature failed:", signResult.error);
      let errorMessage = "Failed to sign the message.";
      if (signResult.error.message.includes("rejected") || signResult.error.message.includes("4001")) {
        errorMessage = "Signature request rejected by user.";
      }
      throw new Error(errorMessage + `: ${signResult.error.message}`);
    }

    const signatureBytes = signResult.value;
    const signatureHex = bytesToHex(signatureBytes);

    return { signature: signatureHex, timestamp };
  } catch (error) {
    console.error("Signature generation failed:", error);
    let errorMessage = "Failed to sign the message.";
    let detail = "";

    if (error instanceof Error) {
      detail = error.message;
    }

    if (typeof error === 'object' && error !== null && 'code' in error) {
      const errorCode = (error as { code: unknown }).code;
      if (errorCode === 4001 || errorCode === 'ACTION_REJECTED') {
        errorMessage = "Signature request rejected by user.";
        detail = "";
      }
    }

    const finalErrorMessage = detail ? `${errorMessage}: ${detail}` : errorMessage;
    throw new Error(finalErrorMessage);
  }
}; 