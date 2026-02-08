# Credits System Implementation Guide

## 🎯 Features Implemented

### 1. Credits Display in Profile ✅
- Shows remaining credits in user dropdown menu
- Real-time credit balance
- Upgrade button for easy access to pricing

### 2. 100 Free Credits for New Users ✅
- Every new user gets 100 credits automatically
- Credits added on first sign-in
- No payment required to start

### 3. Properties Panel for Generate Node Only ✅
- Properties panel only appears when Generate node is selected
- Other nodes (Import, Prompt, Output) don't show properties

### 4. Dynamic Credit Cost Display ✅
- Shows credit cost based on selected model + resolution
- Updates in real-time as you change settings
- Displays your current balance
- Warns if insufficient credits

## 📊 Credit Costs

| Model | 720p | 1080p | 2K | 4K |
|-------|------|-------|----|----|
| **Gemini 2 Flash** | 20 | 30 | 40 | 50 |
| **Gemini 3 Pro** | 30 | 40 | 50 | 60 |
| **Banana Pro** | 35 | 45 | 50 | 70 |

## 🗄️ Database Setup

### Step 1: Create Credits Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create user_credits table
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  credits INTEGER DEFAULT 100 NOT NULL CHECK (credits >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

-- Enable RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits"
  ON user_credits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert credits"
  ON user_credits FOR INSERT
  WITH CHECK (true);
```

### Step 2: Auto-Create Credits for New Users

```sql
-- Function to create credits
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, credits)
  VALUES (NEW.id, 100)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_credits();
```

Or simply run:
```bash
psql -h your-supabase-host -U postgres -d postgres -f create-credits-table.sql
```

## 🎨 User Interface

### Profile Dropdown

When user clicks their avatar:

```
┌─────────────────────────────┐
│ User Name                   │
│ user@email.com              │
├─────────────────────────────┤
│ ✨ Credits Left             │
│    100                      │
│                   [Upgrade] │
├─────────────────────────────┤
│ 🚪 Sign Out                 │
└─────────────────────────────┘
```

### Properties Panel (Generate Node)

```
┌─────────────────────────────┐
│ Properties              [X] │
├─────────────────────────────┤
│ Node Type: Generate Node    │
├─────────────────────────────┤
│ ✨ Cost per generation      │
│    50 credits               │
│    Your balance: 100        │
├─────────────────────────────┤
│ AI Model                    │
│ [Banana Pro            ▼]   │
├─────────────────────────────┤
│ Aspect Ratio                │
│ [16:9 (YouTube)        ▼]   │
├─────────────────────────────┤
│ Resolution                  │
│ [2K (2560x1440)        ▼]   │
├─────────────────────────────┤
│ [▶ Run Generation (50)]     │
└─────────────────────────────┘
```

## 🔄 Credit Flow

### 1. New User Signs Up
```
User signs up with Google
    ↓
Trigger: on_auth_user_created
    ↓
Create user_credits record
    ↓
Set credits = 100
    ↓
User can start generating
```

### 2. User Generates Image
```
User clicks "Run Generation"
    ↓
Check credit cost (e.g., 50 credits)
    ↓
Check user balance (e.g., 100 credits)
    ↓
Sufficient? Yes
    ↓
Deduct 50 credits
    ↓
New balance: 50 credits
    ↓
Run AI generation
    ↓
Update UI with new balance
```

### 3. Insufficient Credits
```
User clicks "Run Generation"
    ↓
Check credit cost (e.g., 50 credits)
    ↓
Check user balance (e.g., 30 credits)
    ↓
Sufficient? No
    ↓
Show error: "Insufficient credits"
    ↓
Suggest upgrade
```

## 💻 Code Structure

### Files Created

```
lib/
├── credits/
│   └── calculator.ts          # Credit cost calculations
└── contexts/
    └── CreditsContext.tsx     # Credits state management

components/
└── workflow-v2/
    └── PropertiesPanel-new.tsx  # Updated properties panel

create-credits-table.sql       # Database schema
CREDITS_SYSTEM_GUIDE.md        # This file
```

### Files Modified

```
app/layout.tsx                 # Added CreditsProvider
components/shared/navbar.tsx   # Added credits display
```

## 🧪 Testing

### Test Credit System

1. **Sign up new user**
   - Sign in with Google
   - Check profile dropdown
   - Should show 100 credits

2. **Check database**
   ```sql
   SELECT * FROM user_credits WHERE user_id = 'your-user-id';
   ```
   Should return: `credits: 100`

3. **Test generation**
   - Open workflow editor
   - Add Generate node
   - Select node
   - Properties panel should appear
   - Change model/resolution
   - Credit cost should update
   - Click "Run Generation"
   - Credits should deduct

4. **Test insufficient credits**
   - Manually set credits to 10 in database
   - Try to generate with 50 credit cost
   - Should show error

## 🎯 Credit Cost Logic

### How Credits are Calculated

```typescript
// Example: Banana Pro + 2K Resolution
const model = 'Banana Pro';
const resolution = '2K';
const credits = CREDIT_COSTS[model][resolution]; // 50 credits
```

### Dynamic Updates

When user changes settings:
1. Get selected model
2. Get selected resolution
3. Look up credit cost in table
4. Update display immediately
5. Check if user has enough credits
6. Enable/disable run button

## 📈 Usage Analytics

Track credit usage:

```sql
-- Create usage log table
CREATE TABLE credit_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  credits_used INTEGER NOT NULL,
  model TEXT NOT NULL,
  resolution TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Log usage
INSERT INTO credit_usage (user_id, credits_used, model, resolution)
VALUES ('user-id', 50, 'Banana Pro', '2K');
```

## 🔐 Security

### Row Level Security

- Users can only view their own credits
- Users can only update their own credits
- System can insert credits for new users
- Credits cannot go negative (CHECK constraint)

### Credit Deduction

```typescript
// Always verify on backend
const success = await deductCredits(amount);
if (!success) {
  // Rollback generation
  return;
}
```

## 🚀 Future Enhancements

### 1. Credit Packages
- Buy extra credits: ₹500 → 1,000 credits
- No expiry
- Add-on to subscription

### 2. Credit History
- View all credit transactions
- Filter by date
- Export to CSV

### 3. Low Credit Warnings
- Email when < 50 credits
- In-app notification
- Suggest upgrade

### 4. Referral Bonuses
- Refer friend: +500 credits
- Friend signs up: +200 credits
- Unlimited referrals

### 5. Daily Free Credits
- 10 free credits per day
- Login bonus
- Encourage daily usage

## 📝 Checklist

- [ ] Run `create-credits-table.sql` in Supabase
- [ ] Verify trigger creates credits for new users
- [ ] Test credit display in navbar
- [ ] Test properties panel shows only for Generate node
- [ ] Test dynamic credit cost updates
- [ ] Test credit deduction on generation
- [ ] Test insufficient credits error
- [ ] Update PropertiesPanel import in Canvas.tsx

## 🎉 Success Criteria

Credits system is working when:

- ✅ New users get 100 credits automatically
- ✅ Credits display in profile dropdown
- ✅ Properties panel only shows for Generate node
- ✅ Credit cost updates based on model + resolution
- ✅ Credits deduct on successful generation
- ✅ Error shown when insufficient credits
- ✅ Balance updates in real-time

---

**Ready to use!** 🚀 Follow the setup steps and start testing.
