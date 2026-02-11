/**
 * Script to grant credits to a user
 * Usage: node scripts/grant-credits.js <email> <credits>
 * Example: node scripts/grant-credits.js user@example.com 10000
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function grantCredits(email, credits) {
  try {
    console.log(`🔍 Looking up user: ${email}`);
    
    // Get user by email
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      throw new Error(`Failed to list users: ${userError.message}`);
    }
    
    const user = users.find(u => u.email === email);
    
    if (!user) {
      throw new Error(`User not found with email: ${email}`);
    }
    
    console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
    
    // Check if user_credits record exists
    const { data: existingCredits, error: checkError } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Failed to check credits: ${checkError.message}`);
    }
    
    if (existingCredits) {
      // Update existing credits
      const { data, error } = await supabase
        .from('user_credits')
        .update({ credits: credits })
        .eq('user_id', user.id)
        .select();
      
      if (error) {
        throw new Error(`Failed to update credits: ${error.message}`);
      }
      
      console.log(`💰 Updated credits from ${existingCredits.credits} to ${credits}`);
    } else {
      // Insert new credits record
      const { data, error } = await supabase
        .from('user_credits')
        .insert({ user_id: user.id, credits: credits })
        .select();
      
      if (error) {
        throw new Error(`Failed to insert credits: ${error.message}`);
      }
      
      console.log(`💰 Created new credits record with ${credits} credits`);
    }
    
    console.log(`✨ Success! ${email} now has ${credits} credits`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.log('Usage: node scripts/grant-credits.js <email> <credits>');
  console.log('Example: node scripts/grant-credits.js user@example.com 10000');
  process.exit(1);
}

const [email, creditsStr] = args;
const credits = parseInt(creditsStr, 10);

if (isNaN(credits) || credits < 0) {
  console.error('❌ Credits must be a positive number');
  process.exit(1);
}

grantCredits(email, credits);
