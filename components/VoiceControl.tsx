import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// Simple blob utils based on documentation provided
function createBlob(data: Float32Array): { data: string, mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return {
        data: btoa(binary),
        mimeType: 'audio/pcm;rate=16000',
    };
}

function decodeAudio(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface VoiceControlProps {
    apiKey: string;
}

const VoiceControl: React.FC<VoiceControlProps> = ({ apiKey }) => {
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(0);
  
  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const outputContextRef = useRef<AudioContext | null>(null);

  const startSession = async () => {
    if (!apiKey || apiKey.trim() === '') {
        alert("Please set your API Key first.");
        return;
    }
    try {
        setIsActive(true);
        // Using provided API Key for immediate access
        // Safe logging for verification
        console.log(`🔑 Voice session initialized with key prefix: ${apiKey.substring(0, 6)}`);
        
        const ai = new GoogleGenAI({ apiKey });
        
        // Setup Output Audio
        outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        
        // Connect Live API
        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            callbacks: {
                onopen: async () => {
                    console.log('Voice Session Opened');
                    
                    // Setup Input Audio
                    const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
                    if (inputContext.state === 'suspended') {
                        await inputContext.resume();
                    }
                    audioContextRef.current = inputContext;
                    
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    streamRef.current = stream;
                    
                    const source = inputContext.createMediaStreamSource(stream);
                    const processor = inputContext.createScriptProcessor(4096, 1, 1);
                    processorRef.current = processor;

                    processor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        
                        // Visualize volume roughly
                        let sum = 0;
                        for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
                        setVolume(Math.min(Math.sqrt(sum / inputData.length) * 10, 1));

                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then(session => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };

                    // Prevent feedback loop by connecting to a 0-gain node before destination
                    // ScriptProcessor requires connection to destination to fire events in some browsers
                    const silentNode = inputContext.createGain();
                    silentNode.gain.value = 0;
                    
                    source.connect(processor);
                    processor.connect(silentNode);
                    silentNode.connect(inputContext.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio && outputContextRef.current) {
                        const ctx = outputContextRef.current;
                        if (ctx.state === 'suspended') {
                            await ctx.resume();
                        }

                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                        
                        // Decode raw PCM 24k
                        const raw = decodeAudio(base64Audio);
                        
                        // SAFEGUARD: Ensure buffer is aligned to 2 bytes (16-bit) to prevent RangeError
                        const alignedLength = raw.length & ~1;
                        const alignedRaw = raw.slice(0, alignedLength);
                        
                        const dataInt16 = new Int16Array(alignedRaw.buffer);
                        const audioBuf = ctx.createBuffer(1, dataInt16.length, 24000);
                        const channelData = audioBuf.getChannelData(0);
                        
                        for(let i=0; i<dataInt16.length; i++) {
                            channelData[i] = dataInt16[i] / 32768.0;
                        }

                        const source = ctx.createBufferSource();
                        source.buffer = audioBuf;
                        source.connect(ctx.destination);
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuf.duration;
                    }
                },
                onclose: () => {
                    console.log('Voice Session Closed');
                    stopSession();
                },
                onerror: (e) => {
                    console.error('Voice Error', e);
                    stopSession();
                }
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                },
                systemInstruction: "You are the Vibe Engineering Voice Director. Briefly acknowledge user commands for UI changes and provide short, professional feedback. Keep responses under 2 sentences."
            }
        });

    } catch (e) {
        console.error("Failed to start voice", e);
        setIsActive(false);
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setVolume(0);
    
    // Cleanup Audio Input
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }

    // Cleanup Live Session
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
        sessionPromiseRef.current = null;
    }
  };

  return (
    <button 
        onClick={isActive ? stopSession : startSession}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
            isActive 
            ? 'bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/20' 
            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
        }`}
    >
        {isActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        <span className="text-xs font-medium w-20 text-center">
            {isActive ? 'Live Active' : 'Voice Mode'}
        </span>
        {isActive && (
            <div className="flex gap-0.5 items-end h-3">
                 {[...Array(3)].map((_, i) => (
                    <div 
                        key={i} 
                        className="w-1 bg-red-500 rounded-full transition-all duration-100" 
                        style={{ height: `${Math.max(20, volume * 100 * (i+1)/3)}%` }}
                    />
                 ))}
            </div>
        )}
    </button>
  );
};

export default VoiceControl;