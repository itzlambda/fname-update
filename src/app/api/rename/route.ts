import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Hex, isAddress } from 'viem';

// Zod schema for validating the request body
const renameRequestSchema = z.object({
    currentFname: z.string().min(1, "Current fname is required."),
    newFname: z.string().min(1, "New fname is required.")
        .regex(/^[a-z0-9][a-z0-9-]{0,15}$/, "Invalid new fname format.")
        .refine(name => !name.startsWith('-') && !name.endsWith('-'), "New fname cannot start or end with a hyphen."),
    fid: z.number().positive("Valid FID is required."),
    owner: z.custom<Hex>(isAddress, "Valid owner address is required."),
    deleteSignature: z.custom<Hex>(), // Assuming Hex format for signatures
    deleteTimestamp: z.number().positive("Valid delete timestamp is required."),
    registerSignature: z.custom<Hex>(),
    registerTimestamp: z.number().positive("Valid register timestamp is required."),
});

// Farcaster API endpoint
const FARCASTER_API_URL = "https://fnames.farcaster.xyz/transfers";

export async function POST(request: NextRequest) {
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (error) {
        console.error("Failed to parse request JSON:", error);
        return NextResponse.json({ error: "Invalid request body: Failed to parse JSON." }, { status: 400 });
    }

    // Validate request body
    const validationResult = renameRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
        // Combine Zod error messages
        const errorMessages = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return NextResponse.json({ error: `Invalid input: ${errorMessages}` }, { status: 400 });
    }

    const {
        currentFname,
        newFname,
        fid,
        owner,
        deleteSignature,
        deleteTimestamp,
        registerSignature,
        registerTimestamp,
    } = validationResult.data;

    // --- 1. Delete the current fname ---
    try {
        console.log(`Attempting to delete fname: ${currentFname} for FID ${fid}`);
        const deleteResponse = await fetch(FARCASTER_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: currentFname,        // Name to delete
                owner: owner,              // Owner address
                signature: deleteSignature, // User's signature for deletion
                from: fid,                 // Current FID owns the name
                to: 0,                     // Transfer to FID 0 means deletion
                timestamp: deleteTimestamp,// Timestamp from signature
                fid: fid,                  // FID making the request (must match 'from')
            }),
        });

        // Log raw response for debugging
        const deleteResponseText = await deleteResponse.text();
        console.log(`Delete response status: ${deleteResponse.status}`);
        console.log(`Delete response body: ${deleteResponseText}`);


        if (!deleteResponse.ok) {
            // Try to parse error from Farcaster API response
             let errorDetail = `Farcaster API returned status ${deleteResponse.status}.`;
            try {
                 const errorJson = JSON.parse(deleteResponseText);
                 errorDetail = errorJson.message || errorJson.error || errorDetail;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_e) {
                // Ignore parsing error, use status code
            }
             console.error(`Failed to delete username ${currentFname}: ${errorDetail}`);
            throw new Error(`Failed to delete username: ${errorDetail}`);
        }
         console.log(`Successfully deleted fname: ${currentFname}`);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during fname deletion.";
        console.error("Error in delete step:", error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    // Add a small delay before attempting to register the new name, just in case
    await new Promise(resolve => setTimeout(resolve, 1000));

    // --- 2. Register the new fname ---
    try {
         console.log(`Attempting to register fname: ${newFname} for FID ${fid}`);
        const registerResponse = await fetch(FARCASTER_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: newFname,             // Name to register
                owner: owner,               // Owner address
                signature: registerSignature, // User's signature for registration
                from: 0,                    // Transfer from FID 0 means registration
                to: fid,                    // Transfer to the user's FID
                timestamp: registerTimestamp, // Timestamp from signature
                fid: fid,                   // FID making the request (must match 'to')
            }),
        });

         // Log raw response for debugging
        const registerResponseText = await registerResponse.text();
        console.log(`Register response status: ${registerResponse.status}`);
        console.log(`Register response body: ${registerResponseText}`);


        if (!registerResponse.ok) {
            // Try to parse error from Farcaster API response
            let errorDetail = `Farcaster API returned status ${registerResponse.status}.`;
            try {
                 const errorJson = JSON.parse(registerResponseText);
                 errorDetail = errorJson.message || errorJson.error || errorDetail;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_e) {
                 // Ignore parsing error, use status code
            }
            console.error(`Failed to register username ${newFname}: ${errorDetail}`);

             // IMPORTANT: At this point, the old name might be deleted, but the new one failed.
             // The frontend should ideally inform the user about this partial failure.
            throw new Error(`Deleted ${currentFname}, but failed to register ${newFname}: ${errorDetail}`);
        }

        console.log(`Successfully registered fname: ${newFname} to FID ${fid}`);
        return NextResponse.json({ success: true, message: `Successfully renamed ${currentFname} to ${newFname}.` }, { status: 200 });

    } catch (error: unknown) {
         const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during fname registration.";
         console.error("Error in register step:", error);
        // Return 500, but include the specific error message which might indicate partial success/failure
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
} 