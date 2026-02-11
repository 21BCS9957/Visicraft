/**
 * Script to check all users and their credits
 * Usage: node scripts/check-users.js
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

async function checkUsers() {
  try {
    console.log('🔍 Fetching all users and their credits...\n');
    
    // Get all users
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      throw new Error(`Failed to list users: ${userError.message}`);
    }
    
    console.log(`📊 Total Users: ${users.length}\n`);
    
    // Get credits for all users
    const { data: credits, error: creditsError } = await supabase
      .from('user_credits')
      .select('*');
    
    if (creditsError) {
      throw new Error(`Failed to fetch credits: ${creditsError.message}`);
    }
    
    // Create a map of user_id to credits
    const creditsMap = {};
    credits.forEach(c => {
      creditsMap[c.user_id] = c.credits;
    });
    
    // Display users with their credits
    console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ Email                                    │ Credits │ Last Sign In          │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    
    users.forEach(user => {
      const email = user.email || 'No email';
      const userCredits = creditsMap[user.id] || 0;
      const lastSignIn = user.last_sign_in_at 
        ? new Date(user.last_sign_in_at).toLocaleString()
        : 'Never';
      
      const emailPadded = email.padEnd(40);
      const creditsPadded = userCredits.toString().padEnd(7);
      const lastSignInPadded = lastSignIn.padEnd(20);
      
      console.log(`│ ${emailPadded} │ ${creditsPadded} │ ${lastSignInPadded} │`);
    });
    
    console.log('└─────────────────────────────────────────────────────────────────────────────┘\n');
    
    // Statistics
    const totalCredits = Object.values(creditsMap).reduce((sum, c) => sum + c, 0);
    const avgCredits = users.length > 0 ? (totalCredits / users.length).toFixed(2) : 0;
    const activeToday = users.filter(u => {
      if (!u.last_sign_in_at) return false;
      const lastSignIn = new Date(u.last_sign_in_at);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return lastSignIn > oneDayAgo;
    }).length;
    
    console.log('📈 Statistics:');
    console.log(`   Total Users: ${users.length}`);
    console.log(`   Active Today: ${activeToday}`);
    console.log(`   Total Credits: ${totalCredits.toLocaleString()}`);
    console.log(`   Average Credits: ${avgCredits}`);
    console.log(`   Users with 0 credits: ${Object.values(creditsMap).filter(c => c === 0).length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUsers();
