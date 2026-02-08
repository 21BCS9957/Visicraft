#!/usr/bin/env node

/**
 * Script to add credits to a user account for testing
 * Usage: node scripts/add-credits.js <email> <amount>
 * Example: node scripts/add-credits.js user@example.com 1000
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addCredits(email, amount) {
  try {
    console.log('🔍 Looking up user:', email);
    
    // Get user by email
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('❌ Error fetching users:', userError.message);
      process.exit(1);
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error('❌ User not found:', email);
      console.log('\n📋 Available users:');
      users.users.forEach(u => console.log(`  - ${u.email} (${u.id})`));
      process.exit(1);
    }
    
    console.log('✅ Found user:', user.email, `(${user.id})`);
    
    // Check current credits
    const { data: currentCredits, error: fetchError } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (fetchError) {
      console.error('❌ Error fetching credits:', fetchError.message);
      process.exit(1);
    }
    
    const oldCredits = currentCredits?.credits || 0;
    console.log('💰 Current credits:', oldCredits);
    
    // Add credits
    const { data, error } = await supabase
      .from('user_credits')
      .update({ 
        credits: oldCredits + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select();
    
    if (error) {
      console.error('❌ Error updating credits:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Credits added successfully!');
    console.log(`💰 Old balance: ${oldCredits}`);
    console.log(`➕ Added: ${amount}`);
    console.log(`💰 New balance: ${oldCredits + amount}`);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('📋 Usage: node scripts/add-credits.js <email> [amount]');
  console.log('📋 Example: node scripts/add-credits.js user@example.com 1000');
  console.log('\n🔍 Listing all users...\n');
  
  // List all users
  (async () => {
    const { data: users } = await supabase.auth.admin.listUsers();
    if (users && users.users.length > 0) {
      console.log('Available users:');
      for (const user of users.users) {
        const { data: credits } = await supabase
          .from('user_credits')
          .select('credits')
          .eq('user_id', user.id)
          .single();
        console.log(`  - ${user.email} (${credits?.credits || 0} credits)`);
      }
    } else {
      console.log('No users found');
    }
  })();
} else {
  const email = args[0];
  const amount = parseInt(args[1]) || 1000; // Default to 1000 credits
  
  addCredits(email, amount);
}
