#!/usr/bin/env node

/**
 * Quick script to add 1000 credits to the first user for testing
 * Usage: node scripts/add-test-credits.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addTestCredits() {
  try {
    console.log('🔍 Fetching all user credits...\n');
    
    // Get all user credits
    const { data: allCredits, error: fetchError } = await supabase
      .from('user_credits')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (fetchError) {
      console.error('❌ Error:', fetchError.message);
      process.exit(1);
    }
    
    if (!allCredits || allCredits.length === 0) {
      console.log('❌ No users found in user_credits table');
      process.exit(1);
    }
    
    console.log(`📋 Found ${allCredits.length} user(s):\n`);
    
    // Show all users and their credits
    allCredits.forEach((user, index) => {
      console.log(`${index + 1}. User ID: ${user.user_id}`);
      console.log(`   Current credits: ${user.credits}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleString()}\n`);
    });
    
    // Add 1000 credits to the first user (most likely you)
    const targetUser = allCredits[0];
    const newCredits = targetUser.credits + 1000;
    
    console.log(`💰 Adding 1000 credits to user: ${targetUser.user_id}`);
    console.log(`   Old balance: ${targetUser.credits}`);
    console.log(`   New balance: ${newCredits}\n`);
    
    const { data, error } = await supabase
      .from('user_credits')
      .update({ credits: newCredits })
      .eq('user_id', targetUser.user_id)
      .select();
    
    if (error) {
      console.error('❌ Error updating credits:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Credits added successfully!');
    console.log('🎉 You now have', newCredits, 'credits for testing!\n');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

addTestCredits();
