import { Hex } from "viem";

// Farcaster ID Registry Contract on OP Mainnet
export const ID_REGISTRY_ADDRESS: Hex = "0x00000000fc6c5f01fc30151999387bb99a9f489b";

// Minimal ABI for the ID Registry, only including the idOf function
export const idRegistryABI = [
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "idOf",
    outputs: [{ internalType: "uint256", name: "fid", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const; // Use 'as const' for better type inference with viem/wagmi 