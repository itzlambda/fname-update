import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner'; // Use toast for validation errors

interface ConfirmationDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    currentFname: string | null;
    newFname: string;
    onConfirm: () => Promise<void>; // The actual rename logic triggered on confirm
    isLoading: boolean; // Loading state passed from parent
}

// Basic validation for fname (align with main page logic)
const isValidFname = (fname: string): boolean => {
    const fnameRegex = /^[a-z0-9][a-z0-9-]{0,15}$/;
    return fnameRegex.test(fname) && !fname.startsWith('-') && !fname.endsWith('-');
};


export function ConfirmationDialog({
    isOpen,
    onOpenChange,
    currentFname,
    newFname,
    onConfirm,
    isLoading,
}: ConfirmationDialogProps) {
    const [confirmationInput, setConfirmationInput] = useState("");
    const [confirmationError, setConfirmationError] = useState<string | null>(null);

    // Reset state when dialog opens/closes
    React.useEffect(() => {
        if (isOpen) {
            setConfirmationInput("");
            setConfirmationError(null);
        }
    }, [isOpen]);


    const handleConfirmClick = async () => {
        setConfirmationError(null); // Clear previous error

        // --- Pre-confirmation Checks (moved from parent's openConfirmationDialog) ---
        if (!currentFname) {
            toast.error("Cannot proceed without a current fname detected.");
            onOpenChange(false); // Close dialog
            return;
        }
        if (!newFname) {
            toast.error("New fname cannot be empty.");
            // Keep dialog open, maybe set confirmationError?
            setConfirmationError("New fname cannot be empty.");
            return;
        }
        if (currentFname === newFname) {
            toast.error("New username cannot be the same as the current one.");
            onOpenChange(false); // Close dialog
            return;
        }
        if (!isValidFname(newFname)) {
            toast.error("New username has invalid characters, length, or format.");
            // Keep dialog open, maybe set confirmationError?
            setConfirmationError("Invalid format for the new username.");
            return;
        }
        // --- End Pre-confirmation Checks ---


        if (confirmationInput.toLowerCase() === requiredPhrase) {
            // Phrase matches, proceed with the actual rename logic passed via onConfirm
            // The parent's onConfirm function will handle closing the dialog on success/failure
            try {
                await onConfirm();
                // No need to close dialog here, parent's finally block in handleRename should do it
            } catch (error) {
                // Error is handled and toasted in the parent's handleRename
                // Keep the dialog open in case user wants to retry? Or parent closes it.
                // Let's assume parent closes it in the finally block.
                console.error("ConfirmationDialog: onConfirm failed", error)
            }

        } else {
            // Phrase does not match, show an error
            setConfirmationError("Confirmation text does not match. Please type it exactly as shown.");
        }
    };

    const handleCancel = () => {
        onOpenChange(false);
    }

    const requiredPhrase = newFname;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Confirm Fname Change</DialogTitle>
                    <DialogDescription className="pt-2">
                        You are about to change your Farcaster username from
                        <strong className="px-1">{currentFname || '...'}</strong> to
                        <strong className="px-1">{newFname || '...'}</strong>.
                        <br />
                        <br />
                        This action requires two signatures and is processed via the fname server.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-1.5 text-center">
                    <Label htmlFor="confirmationText" className="px-1">
                        To confirm, retype your new fname:
                    </Label>
                    <p className="text-sm font-semibold text-foreground px-1.5 py-0.5 rounded mb-2 center">{requiredPhrase}</p>
                    <Input
                        id="confirmationText"
                        value={confirmationInput}
                        onChange={(e) => {
                            setConfirmationInput(e.target.value);
                            // Clear error message as user types
                            if (confirmationError) setConfirmationError(null);
                        }}
                        autoComplete='off'
                        placeholder={`Type the phrase above`}
                        className={confirmationError ? "border-red-500" : ""} // Highlight if error
                        disabled={isLoading} // Disable input while rename is in progress
                    />
                    {confirmationError && (
                        <p className="text-sm text-red-500 pt-1">{confirmationError}</p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        type="button" // Use type="button" to prevent form submission
                        onClick={handleConfirmClick} // Changed handler
                        // Disable confirm button if input doesn't match (case-insensitive) or if loading
                        disabled={
                            isLoading ||
                            confirmationInput.toLowerCase() !== requiredPhrase.toLowerCase() ||
                            !newFname // Also disable if newFname is somehow empty
                        }
                    >
                        {isLoading ? "Processing..." : "Confirm Rename"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 