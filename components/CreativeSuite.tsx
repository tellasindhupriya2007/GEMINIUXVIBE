import React, { useState, useRef } from 'react';
import { Image, Upload, Loader2, Sparkles, Paperclip, X } from 'lucide-react';
import { generateAsset, analyzeDesignImage } from '../services/gemini';

interface CreativeSuiteProps {
    onAttachAsset: (asset: string) => void;
    apiKey: string;
}

const CreativeSuite: React.FC<CreativeSuiteProps> = ({ onAttachAsset, apiKey }) => {
  const [activeTab, setActiveTab] = useState<'STUDIO' | 'VISION'>('STUDIO');
  
  // Studio State
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetSize, setAssetSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Vision State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HANDLERS ---

  const handleGenerateImage = async () => {
    if (!assetPrompt) return;
    if (!apiKey) {
        alert("Please set your API Key first.");
        return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);
    try {
        const result = await generateAsset(apiKey, assetPrompt, assetSize);
        setGeneratedImage(result);
    } catch (e) {
        console.error(e);
        alert('Image generation failed');
    }
    setIsGenerating(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setUploadedImage(base64);
            // Auto analyze
            runAnalysis(base64.split(',')[1]);
        };
        reader.readAsDataURL(file);
    }
  };

  const runAnalysis = async (base64NoHeader: string) => {
      if (!apiKey) return;
      setIsAnalyzing(true);
      setAnalysis('');
      try {
          const result = await analyzeDesignImage(apiKey, base64NoHeader);
          setAnalysis(result);
      } catch (e) {
          setAnalysis('Could not analyze image.');
      }
      setIsAnalyzing(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] w-full">
      
      {/* Tabs */}
      <div className="flex border-b border-zinc-800 shrink-0">
        <button 
            onClick={() => setActiveTab('STUDIO')}
            className={`flex-1 py-2 text-[10px] font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'STUDIO' ? 'text-white border-b-2 border-blue-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'}`}>
            <Sparkles className="w-3 h-3" /> Studio
        </button>
        <button 
            onClick={() => setActiveTab('VISION')}
            className={`flex-1 py-2 text-[10px] font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'VISION' ? 'text-white border-b-2 border-blue-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'}`}>
            <Upload className="w-3 h-3" /> Vision
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        
        {/* STUDIO TAB */}
        {activeTab === 'STUDIO' && (
            <div className="space-y-6">
                
                {/* Image Gen */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-zinc-300">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Asset Generator</span>
                    </div>
                    <div className="space-y-3">
                        <textarea 
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-xs h-20 resize-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-zinc-600" 
                            placeholder="Describe your asset (e.g., 'A modern coffee cup icon, flat style')..."
                            value={assetPrompt}
                            onChange={(e) => setAssetPrompt(e.target.value)}
                        />
                        <div className="flex gap-2">
                            {(['1K', '2K', '4K'] as const).map(size => (
                                <button 
                                    key={size}
                                    onClick={() => setAssetSize(size)}
                                    className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium border transition-all ${assetSize === size ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'}`}>
                                    {size}
                                </button>
                            ))}
                        </div>
                        <button 
                            disabled={isGenerating}
                            onClick={handleGenerateImage}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-medium transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isGenerating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                                </span>
                            ) : 'Generate Asset'}
                        </button>
                    </div>
                    {generatedImage && (
                        <div className="space-y-2">
                            <div className="rounded-lg overflow-hidden border border-zinc-700 shadow-xl">
                                <img src={generatedImage} alt="Generated" className="w-full h-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-zinc-800" />
                            </div>
                            <button 
                                onClick={() => onAttachAsset(generatedImage)}
                                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg flex items-center justify-center gap-2 border border-zinc-700 transition-colors group">
                                <Paperclip className="w-3.5 h-3.5 group-hover:text-blue-400 transition-colors" />
                                Use as Reference
                            </button>
                        </div>
                    )}
                </div>

            </div>
        )}

        {/* VISION TAB */}
        {activeTab === 'VISION' && (
            <div className="space-y-4 h-full flex flex-col">
                 {!uploadedImage ? (
                     <div className="flex-1 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-center hover:bg-zinc-900/30 hover:border-zinc-700 transition-colors cursor-pointer group min-h-[150px]" onClick={() => fileInputRef.current?.click()}>
                        <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                            <Upload className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
                        </div>
                        <span className="text-xs font-medium text-zinc-400 block mb-1">Upload UI Screenshot</span>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*"
                            onChange={handleImageUpload}
                        />
                     </div>
                 ) : (
                    <div className="space-y-4 flex-1 flex flex-col">
                        <div className="relative group rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                             <img src={uploadedImage} alt="Analysis Target" className="w-full max-h-48 object-cover opacity-80" />
                             <button 
                                onClick={() => {setUploadedImage(null); setAnalysis('');}}
                                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
                                <X className="w-3 h-3" />
                             </button>
                        </div>
                         <button 
                            onClick={() => onAttachAsset(uploadedImage)}
                            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg flex items-center justify-center gap-2 border border-zinc-700 transition-colors group">
                            <Paperclip className="w-3.5 h-3.5 group-hover:text-blue-400 transition-colors" />
                            Use as Reference
                        </button>
                        <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 overflow-y-auto custom-scrollbar">
                            <h4 className="text-[10px] font-bold text-blue-400 mb-2 flex items-center gap-2 uppercase tracking-wide">
                                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                Gemini Analysis
                            </h4>
                            {isAnalyzing ? (
                                <div className="space-y-2">
                                    <div className="h-2 bg-zinc-800 rounded animate-pulse w-3/4"></div>
                                    <div className="h-2 bg-zinc-800 rounded animate-pulse w-1/2"></div>
                                </div>
                            ) : (
                                <p className="text-[10px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                    {analysis || "Ready to analyze."}
                                </p>
                            )}
                        </div>
                    </div>
                 )}
            </div>
        )}

      </div>
    </div>
  );
};

export default CreativeSuite;