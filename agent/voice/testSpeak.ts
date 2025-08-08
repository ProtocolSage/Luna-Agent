import { VoiceEngine } from './voiceEngine';

(async () => {
  const voice = new VoiceEngine();
  
  console.log('🎤 Testing Nova Westbrook voice...');
  
  // Test 1: Basic speech
  await voice.say('Hello! I am Nova Westbrook, your AI assistant.');
  
  // Test 2: Interruption
  console.log('🔄 Testing interruption...');
  setTimeout(() => {
    console.log('⏹️ Interrupting!');
    voice.say('Interrupted! This is the new message.');
  }, 1000);
  
  await voice.say('This is a long message that will be interrupted in one second...');
  
  // Test 3: Long text chunking
  console.log('📚 Testing long text...');
  const longText = `
    This is a test of the emergency broadcast system. 
    ${Array(10).fill('This sentence will be repeated to create a long text. ').join('')}
    If this had been an actual emergency, you would have been instructed where to tune.
  `;
  await voice.say(longText);
  
  // Cleanup
  await new Promise(r => setTimeout(r, 2000));
  await voice.destroy();
  console.log('✅ All tests complete!');
  process.exit(0);
})();
