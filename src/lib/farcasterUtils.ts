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

// Farcaster API endpoint (can be moved to constants.ts)
const FARCASTER_API_URL = "https://fnames.farcaster.xyz/transfers";

/**
 * Executes the full fname rename process: check availability, generate signatures,
 * delete the old name, and register the new name.
 * Communicates directly with the Farcaster API.
 * Throws errors if any step fails.
 */
export const executeFnameRename = async (
  currentFname: string,
  newFname: string,
  fid: number,
  owner: Hex, // Owner address
  walletClient: WalletClient
): Promise<boolean> => {
  // 1. Check new fname availability
  const isTaken = await isUsernameTaken(newFname);
  if (isTaken) {
    throw new Error(`Username "${newFname}" is already taken.`);
  }

  // 2. Generate signature to delete currentFname
  const deleteTimestamp = Math.floor(Date.now() / 1000);
  let deleteSignatureData;
  try {
    deleteSignatureData = await generateSignature(
      currentFname,
      owner,
      deleteTimestamp,
      walletClient
    );
  } catch (error) {
    throw new Error(`Failed to get release signature for ${currentFname}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 3. Generate signature to register newFname
  const registerTimestamp = Math.max(deleteTimestamp + 1, Math.floor(Date.now() / 1000));
  let registerSignatureData;
  try {
    registerSignatureData = await generateSignature(
      newFname,
      owner,
      registerTimestamp,
      walletClient
    );
  } catch (error) {
     throw new Error(`Failed to get claim signature for ${newFname}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4. Delete the current fname via Farcaster API
  try {
    const deleteResponse = await fetch(FARCASTER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: currentFname,
        owner: owner,
        signature: deleteSignatureData.signature,
        from: fid,
        to: 0,
        timestamp: deleteSignatureData.timestamp,
        fid: fid,
      }),
    });
    const deleteResponseText = await deleteResponse.text();
    if (!deleteResponse.ok) {
      let errorDetail = `API returned status ${deleteResponse.status}.`;
      try {
        const errorJson = JSON.parse(deleteResponseText);
        errorDetail = errorJson.message || errorJson.error || errorDetail;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_e) { /* Ignore JSON parsing error */ }
      console.error(`Failed to delete username ${currentFname}: ${errorDetail}`, deleteResponseText);
      throw new Error(`Failed to release username: ${errorDetail}`);
    }
  } catch (error) {
    console.error("Error in delete step:", error);
    // Re-throw the specific error
    throw error;
  }

  // Delay before registration
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 5. Register the new fname via Farcaster API
  try {
    const registerResponse = await fetch(FARCASTER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFname,
        owner: owner,
        signature: registerSignatureData.signature,
        from: 0,
        to: fid,
        timestamp: registerSignatureData.timestamp,
        fid: fid,
      }),
    });
    const registerResponseText = await registerResponse.text();
    if (!registerResponse.ok) {
      let errorDetail = `API returned status ${registerResponse.status}.`;
      try {
        const errorJson = JSON.parse(registerResponseText);
        errorDetail = errorJson.message || errorJson.error || errorDetail;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_e) { /* Ignore JSON parsing error */ }
      console.error(`Failed to register username ${newFname}: ${errorDetail}`, registerResponseText);
      // Indicate partial failure
      throw new Error(`Released ${currentFname}, but failed to claim ${newFname}: ${errorDetail}`);
    }
  } catch (error) {
    console.error("Error in register step:", error);
    // Re-throw the specific error (which might indicate partial failure)
    throw error;
  }

  // If we reach here, both steps succeeded
  return true;
}; 