#!/usr/bin/env node

/**
 * Setup script to add credits for testing
 * This will find your user and add 1000 credits
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

async function setupCredits() {
  try {
    console.log('🔍 Checking authentication...\n');
    
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('❌ No active session found.');
      console.log('📝 Please log in to the app first, then run this script again.\n');
      console.log('Steps:');
      console.log('1. Start your dev server: npm run dev');
      console.log('2. Go to http://localhost:3000/login');
      console.log('3. Log in with Google');
      console.log('4. Run this script again\n');
      process.exit(1);
    }
    
    const userId = session.user.id;
    const userEmail = session.user.email;
    
    console.log('✅ Found logged in user:');
    console.log(`   Email: ${userEmail}`);
    console.log(`   ID: ${userId}\n`);
    
    // Check if user has credits entry
    const { data: existingCredits, error: fetchError } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ Error checking credits:', fetchError.message);
      process.exit(1);
    }
    
    if (existingCredits) {
      // User has credits, update them
      console.log(`💰 Current credits: ${existingCredits.credits}`);
      const newCredits = existingCredits.credits + 1000;
      
      const { error: updateError } = await supabase
        .from('user_credits')
        .update({ credits: newCredits })
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('❌ Error updating credits:', updateError.message);
        process.exit(1);
      }
      
      console.log(`✅ Added 1000 credits!`);
      console.log(`💰 New balance: ${newCredits} credits\n`);
    } else {
      // User doesn't have credits entry, create one
      console.log('📝 Creating credits entry...');
      
      const { error: insertError } = await supabase
        .from('user_credits')
        .insert({ 
          user_id: userId, 
          credits: 1000 
        });
      
      if (insertError) {
        console.error('❌ Error creating credits:', insertError.message);
        process.exit(1);
      }
      
      console.log('✅ Credits entry created!');
      console.log('💰 Balance: 1000 credits\n');
    }
    
    console.log('🎉 All set! You can now test generation in the app.\n');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

setupCredits();
