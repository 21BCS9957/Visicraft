import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

interface VoiceConfig {
  languageCode: string;
  name: string;
  ssmlGender: string;
}

const VOICE_CONFIGS: Record<string, VoiceConfig> = {
  // Journey voices (Ultra Premium - Multilingual)
  'en-US-Journey-F': { languageCode: 'en-US', name: 'en-US-Journey-F', ssmlGender: 'FEMALE' },
  'en-US-Journey-D': { languageCode: 'en-US', name: 'en-US-Journey-D', ssmlGender: 'MALE' },
  'en-US-Journey-O': { languageCode: 'en-US', name: 'en-US-Journey-O', ssmlGender: 'FEMALE' },
  
  // Studio voices (most natural, premium)
  'en-US-Studio-O': { languageCode: 'en-US', name: 'en-US-Studio-O', ssmlGender: 'FEMALE' },
  'en-US-Studio-Q': { languageCode: 'en-US', name: 'en-US-Studio-Q', ssmlGender: 'MALE' },
  
  // Wavenet voices (very natural)
  'en-US-Wavenet-A': { languageCode: 'en-US', name: 'en-US-Wavenet-A', ssmlGender: 'MALE' },
  'en-US-Wavenet-C': { languageCode: 'en-US', name: 'en-US-Wavenet-C', ssmlGender: 'FEMALE' },
  'en-US-Wavenet-F': { languageCode: 'en-US', name: 'en-US-Wavenet-F', ssmlGender: 'FEMALE' },
  'en-US-Wavenet-H': { languageCode: 'en-US', name: 'en-US-Wavenet-H', ssmlGender: 'FEMALE' },
  'en-US-Wavenet-J': { languageCode: 'en-US', name: 'en-US-Wavenet-J', ssmlGender: 'MALE' },
  'en-GB-Wavenet-A': { languageCode: 'en-GB', name: 'en-GB-Wavenet-A', ssmlGender: 'FEMALE' },
  'en-GB-Wavenet-B': { languageCode: 'en-GB', name: 'en-GB-Wavenet-B', ssmlGender: 'MALE' },
  'en-GB-Wavenet-D': { languageCode: 'en-GB', name: 'en-GB-Wavenet-D', ssmlGender: 'MALE' },
  
  // Neural2 voices (backup)
  'en-US-Neural2-J': { languageCode: 'en-US', name: 'en-US-Neural2-J', ssmlGender: 'MALE' },
  'en-US-Neural2-A': { languageCode: 'en-US', name: 'en-US-Neural2-A', ssmlGender: 'MALE' },
  'en-US-Neural2-C': { languageCode: 'en-US', name: 'en-US-Neural2-C', ssmlGender: 'FEMALE' },
  'en-US-Neural2-F': { languageCode: 'en-US', name: 'en-US-Neural2-F', ssmlGender: 'FEMALE' },
  'en-GB-Neural2-F': { languageCode: 'en-GB', name: 'en-GB-Neural2-F', ssmlGender: 'FEMALE' },
  'en-GB-Neural2-D': { languageCode: 'en-GB', name: 'en-GB-Neural2-D', ssmlGender: 'MALE' },
  'hi-IN-Neural2-A': { languageCode: 'hi-IN', name: 'hi-IN-Neural2-A', ssmlGender: 'FEMALE' },
  'hi-IN-Neural2-B': { languageCode: 'hi-IN', name: 'hi-IN-Neural2-B', ssmlGender: 'MALE' },
  'hi-IN-Wavenet-A': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A', ssmlGender: 'FEMALE' },
  'hi-IN-Wavenet-B': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-B', ssmlGender: 'MALE' },
};

const EXPRESSION_CONFIG: Record<string, { speakingRate: number; pitch: number; volumeGainDb: number }> = {
  // Natural expressions
  'neutral': { speakingRate: 0.95, pitch: 0, volumeGainDb: 0 },
  'conversational': { speakingRate: 0.98, pitch: 0.3, volumeGainDb: 0.5 },
  'professional': { speakingRate: 0.92, pitch: -0.3, volumeGainDb: 0 },
  'calm': { speakingRate: 0.88, pitch: -0.5, volumeGainDb: -0.5 },
  'friendly': { speakingRate: 0.98, pitch: 0.8, volumeGainDb: 0.8 },
  
  // Emotional expressions
  'cheerful': { speakingRate: 1.05, pitch: 1.5, volumeGainDb: 1.5 },
  'excited': { speakingRate: 1.15, pitch: 3, volumeGainDb: 2 },
  'enthusiastic': { speakingRate: 1.12, pitch: 2.5, volumeGainDb: 1.8 },
  'happy': { speakingRate: 1.08, pitch: 2, volumeGainDb: 1.2 },
  
  'sad': { speakingRate: 0.8, pitch: -1.5, volumeGainDb: -1.5 },
  'melancholic': { speakingRate: 0.82, pitch: -1.2, volumeGainDb: -1.2 },
  'somber': { speakingRate: 0.85, pitch: -1, volumeGainDb: -1 },
  
  'angry': { speakingRate: 1.1, pitch: -0.5, volumeGainDb: 2.5 },
  'intense': { speakingRate: 1.08, pitch: -0.3, volumeGainDb: 2 },
  'assertive': { speakingRate: 1.05, pitch: 0, volumeGainDb: 1.5 },
  
  'fearful': { speakingRate: 1.2, pitch: 2.5, volumeGainDb: -0.5 },
  'anxious': { speakingRate: 1.15, pitch: 2, volumeGainDb: -0.3 },
  'nervous': { speakingRate: 1.18, pitch: 2.2, volumeGainDb: -0.4 },
  
  'disgusted': { speakingRate: 0.85, pitch: -1.8, volumeGainDb: 0.5 },
  
  // Storytelling & narration
  'storytelling': { speakingRate: 0.93, pitch: 0.5, volumeGainDb: 0.3 },
  'dramatic': { speakingRate: 0.9, pitch: 0.8, volumeGainDb: 1 },
  'mysterious': { speakingRate: 0.87, pitch: -0.8, volumeGainDb: -0.8 },
  'suspenseful': { speakingRate: 0.85, pitch: -1, volumeGainDb: -0.5 },
  
  // Business & professional
  'authoritative': { speakingRate: 0.9, pitch: -0.8, volumeGainDb: 1 },
  'confident': { speakingRate: 0.95, pitch: -0.2, volumeGainDb: 0.8 },
  'motivational': { speakingRate: 1.02, pitch: 1, volumeGainDb: 1.5 },
  'inspirational': { speakingRate: 0.98, pitch: 0.8, volumeGainDb: 1.2 },
  
  // Content creation
  'youtube': { speakingRate: 1.05, pitch: 1.2, volumeGainDb: 1.5 },
  'podcast': { speakingRate: 0.95, pitch: 0, volumeGainDb: 0.5 },
  'audiobook': { speakingRate: 0.9, pitch: -0.2, volumeGainDb: 0 },
  'advertisement': { speakingRate: 1.08, pitch: 1.5, volumeGainDb: 2 },
};

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId, expression } = await request.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (!voiceId) {
      return NextResponse.json(
        { error: 'Voice ID is required' },
        { status: 400 }
      );
    }

    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      return NextResponse.json(
        { error: 'Text-to-Speech API not configured' },
        { status: 500 }
      );
    }

    // Parse service account credentials
    const credentials = JSON.parse(serviceAccountJson);
    
    // Initialize Google Auth with service account
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    // Get access token
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    const voiceConfig = VOICE_CONFIGS[voiceId];
    if (!voiceConfig) {
      return NextResponse.json(
        { error: 'Invalid voice ID' },
        { status: 400 }
      );
    }

    const expressionConfig = EXPRESSION_CONFIG[expression || 'neutral'] || EXPRESSION_CONFIG.neutral;

    console.log('🎤 ========================================');
    console.log('🎤 TEXT-TO-SPEECH REQUEST');
    console.log('🎤 ========================================');
    console.log('🗣️  Voice:', voiceConfig.name);
    console.log('😀 Expression:', expression || 'neutral');
    console.log('📝 Text length:', text.length, 'characters');
    console.log('🎤 ========================================');

    const requestBody = {
      input: { text: text },
      voice: {
        languageCode: voiceConfig.languageCode,
        name: voiceConfig.name,
        ssmlGender: voiceConfig.ssmlGender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: expressionConfig.speakingRate,
        pitch: expressionConfig.pitch,
        volumeGainDb: expressionConfig.volumeGainDb,
        sampleRateHertz: 24000,
        // Add effects profiles for more natural sound
        effectsProfileId: ['headphone-class-device', 'large-home-entertainment-class-device'],
      },
    };

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken.token}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google TTS API Error:', errorData);
      throw new Error(errorData.error?.message || 'Speech synthesis failed');
    }

    const data = await response.json();

    if (!data.audioContent) {
      throw new Error('No audio content returned');
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');
    
    const base64Audio = `data:audio/mp3;base64,${data.audioContent}`;

    return NextResponse.json({
      success: true,
      audioUrl: base64Audio,
      audioSize: audioBuffer.length,
    });
  } catch (error) {
    console.error('Text-to-Speech error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Speech generation failed' },
      { status: 500 }
    );
  }
}
