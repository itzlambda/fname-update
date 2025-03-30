import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Hex } from "viem";
import { ID_REGISTRY_ADDRESS, idRegistryABI } from "@/lib/constants";
import { getCurrentFnameFromFid } from "@/lib/farcasterUtils"; // Import from utils
import { toast } from "sonner";

export function useFarcasterIdentity() {
  const { address, isConnected } = useAccount();
  const [isLoadingFid, setIsLoadingFid] = useState(true);
  const [isLoadingCurrentFname, setIsLoadingCurrentFname] = useState(false);
  const [fetchedFid, setFetchedFid] = useState<number | null>(null);
  const [fetchedCurrentFname, setFetchedCurrentFname] = useState<string | null>(
    null
  );
  const [fidError, setFidError] = useState<string | null>(null); // Store FID error message

  // --- Fetch FID ---
  const { data: fidBigInt, error: errorFid } = useReadContract({
    address: ID_REGISTRY_ADDRESS,
    abi: idRegistryABI,
    functionName: "idOf",
    args: [address as Hex],
    chainId: 10, // Optimism
    query: {
      enabled: !!address, // Only run if address is available
    },
  });

  // Process FID result and update loading/error states
  useEffect(() => {
    // Start loading if connected but FID/error aren't determined yet
    setIsLoadingFid(!!address && fidBigInt === undefined && !errorFid);
    setFidError(null); // Reset error on address change or successful fetch

    if (errorFid) {
      console.error("Error fetching FID:", errorFid);
      const baseMessage =
        errorFid.message.split("Args:")[0] || "Failed to fetch FID.";
      setFidError(baseMessage.trim());
      setFetchedFid(null);
    } else if (fidBigInt !== undefined && fidBigInt !== null) {
      const fidNumber = Number(fidBigInt);
      setFetchedFid(fidNumber === 0 ? null : fidNumber);
      if (fidNumber === 0) {
         setFidError("Connected address does not own a Farcaster ID.");
      }
    } else if (address) {
       // If address exists but fidBigInt is null/undefined and no error, it might still be loading
       // or the ID might be 0. The setIsLoadingFid handles the loading part.
       // If ID is 0, set error message.
        if(fidBigInt === 0n) {
             setFidError("Connected address does not own a Farcaster ID.");
             setFetchedFid(null);
        } else if (fidBigInt === undefined) {
             // Still loading
        } else {
             // Catch other cases where fid is null/undefined unexpectedly
             setFetchedFid(null);
        }

    } else {
      // Not connected, reset FID
      setFetchedFid(null);
    }
  }, [fidBigInt, address, errorFid]);

  // --- Fetch Current Fname using FID ---
  useEffect(() => {
    // Reset fname state when FID changes or becomes invalid
    setFetchedCurrentFname(null);
    setIsLoadingCurrentFname(false);

    if (fetchedFid && fetchedFid > 0) {
      setIsLoadingCurrentFname(true);
      let isMounted = true; // Prevent state update on unmounted component

      getCurrentFnameFromFid(fetchedFid)
        .then((fname) => {
          if (isMounted) {
            setFetchedCurrentFname(fname);
            if (!fname) {
                 console.log(`FID ${fetchedFid} does not have an fname assigned.`);
                 // Optionally set an fname-specific error/status message here
            }
          }
        })
        .catch((error) => {
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

      return () => {
        isMounted = false;
      }; // Cleanup function
    }
  }, [fetchedFid]); // Rerun when fetchedFid changes

  return {
    address,
    isConnected,
    fid: fetchedFid,
    currentFname: fetchedCurrentFname,
    isLoadingFid,
    isLoadingCurrentFname,
    fidError, // Expose the FID error state
  };
} 