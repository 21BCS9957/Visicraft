# Credit Protection & UI Updates

## Overview
Fixed critical credit deduction bug and updated UI text for better user experience.

## Changes Made

### 1. Button Text Update ✅
**Changed**: "Run Generation" → "Create"
**Changed**: "Generating..." → "Creating..."
**Changed**: "Thumbnail generated!" → "Image created!"

**Reason**: Shorter, cleaner, more professional

### 2. Credit Protection System ✅

#### Problem
Credits were being deducted even when:
- Validation failed (missing images/prompts)
- Generation was already running
- API call failed

#### Solution
Implemented multi-layer protection:

**A. Validation BEFORE Credit Deduction**
```typescript
// Check if already running
if (isRunning) {
  toast.error('Generation already in progress');
  return; // Exit BEFORE deducting credits
}

// Validate inputs
if (!hasReferenceImage && !hasSourceImage) {
  toast.error('Connect at least one image');
  return; // Exit BEFORE deducting credits
}

// Set status to processing FIRST (prevents double-clicks)
setNodes(...status: 'processing'...);

// THEN deduct credits
const deducted = await deductCredits(creditCost);
if (!deducted) {
  // Revert status if deduction fails
  setNodes(...status: 'idle'...);
  return;
}
```

**B. Automatic Credit Refund on Failure**
Added `addCredits()` function to CreditsContext:
```typescript
const addCredits = async (amount: number): Promise<boolean> => {
  const newCredits = credits + amount;
  await supabase
    .from('user_credits')
    .update({ credits: newCredits })
    .eq('user_id', user.id);
  setCredits(newCredits);
  return true;
};
```

**C. Error Handling with Refund**
```typescript
try {
  // API call
  const response = await fetch('/api/generate', {...});
  // ... success handling
} catch (error) {
  // Refund credits on error
  await addCredits(creditCost);
  await refreshCredits();
  toast.error('Generation failed. Credits refunded.');
}
```

### 3. Protection Flow

```
User clicks "Create"
    ↓
Check if already running → YES → Show error, EXIT
    ↓ NO
Validate inputs → FAIL → Show error, EXIT
    ↓ PASS
Set status to "processing" (prevents double-click)
    ↓
Deduct credits → FAIL → Revert status, EXIT
    ↓ SUCCESS
Call API
    ↓
SUCCESS → Update node, refresh credits
    ↓
FAIL → Refund credits, show error
```

## Files Modified

1. **components/workflow-v2/nodes/GenerateNode.tsx**
   - Updated button text
   - Moved validation before credit deduction
   - Set processing status before deduction
   - Added credit refund on error
   - Added `addCredits` to imports

2. **lib/contexts/CreditsContext.tsx**
   - Added `addCredits()` function
   - Updated interface and provider
   - Added refund logging

3. **components/workflow-v2/SmartHandle.tsx**
   - Added `style` prop support (TypeScript fix)

## Testing Checklist

- [x] Credits NOT deducted when validation fails
- [x] Credits NOT deducted when already running
- [x] Credits NOT deducted on double-click
- [x] Credits refunded when API fails
- [x] Credits refunded when network error
- [x] Button shows "Create" instead of "Run Generation"
- [x] Loading state shows "Creating..."
- [x] Success message shows "Image created!"
- [x] Error message includes "Credits refunded"

## User Benefits

1. **No More Wasted Credits**: Credits only deducted when generation actually starts
2. **Automatic Refunds**: If generation fails, credits are automatically returned
3. **Clear Feedback**: Users know exactly what's happening
4. **Cleaner UI**: Shorter, more professional button text
5. **Double-Click Protection**: Status set before deduction prevents race conditions

## Technical Details

### Credit Deduction Order (OLD - BUGGY)
```
1. Validate inputs
2. Deduct credits ❌ (happens even if validation fails)
3. Set processing status
4. Call API
```

### Credit Deduction Order (NEW - SAFE)
```
1. Check if running
2. Validate inputs
3. Set processing status (prevents double-click)
4. Deduct credits ✅ (only after validation passes)
5. Call API
6. On error: Refund credits ✅
```

## Edge Cases Handled

1. **User clicks button twice rapidly**
   - First click sets status to "processing"
   - Second click sees `isRunning = true` and exits immediately
   - Credits only deducted once

2. **Missing images/prompts**
   - Validation fails
   - Error shown to user
   - Function exits BEFORE credit deduction
   - Credits NOT deducted

3. **API timeout or error**
   - Credits already deducted
   - Error caught in try/catch
   - `addCredits()` called to refund
   - User notified: "Credits refunded"

4. **Insufficient credits**
   - `deductCredits()` returns false
   - Status reverted to "idle"
   - User can fix and try again

## Console Logs for Debugging

```
🎯 Generate Node Validation: { hasReferenceImage, hasSourceImage, hasPrompt }
💳 Credit cost for generation: 50
✅ Credits deducted: 50
📤 Mode: Full transformation (reference + source + prompt)
📥 API Response: { status: 200, result }
✅ Node updated successfully
```

On error:
```
❌ Generation error: Error message
💰 Refunding credits due to generation failure: 50
✅ Credits added successfully
```

---

**Status**: ✅ Complete
**Priority**: Critical (prevents credit loss)
**Impact**: High (affects all users)
