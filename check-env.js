// Quick test to check environment variables
console.log('Checking environment variables...\n');

console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 
  `${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.slice(-4)}` : 
  'NOT FOUND');

console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 
  `${process.env.ANTHROPIC_API_KEY.substring(0, 7)}...${process.env.ANTHROPIC_API_KEY.slice(-4)}` : 
  'NOT FOUND');

console.log('\nAll env vars starting with OPENAI or ANTHROPIC:');
Object.keys(process.env).forEach(key => {
  if (key.includes('OPENAI') || key.includes('ANTHROPIC')) {
    console.log(`${key}: ${process.env[key]?.substring(0, 7)}...`);
  }
});

console.log('\nChecking if running in new command prompt...');
console.log('PATH includes user profile:', process.env.PATH?.includes(process.env.USERPROFILE || '') ? 'YES' : 'NO');
