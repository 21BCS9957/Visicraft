import React, { memo } from 'react';
import { useStore } from 'reactflow';
import { Image as ImageIcon, Zap, MessageSquare, StickyNote, Play, Upload } from 'lucide-react';

const NOTE_COLORS = [
    { name: 'Yellow', bg: '#fef3c7', border: '#fbbf24', text: '#78350f' },
    { name: 'Pink', bg: '#fce7f3', border: '#ec4899', text: '#831843' },
    { name: 'Blue', bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
    { name: 'Green', bg: '#d1fae5', border: '#10b981', text: '#064e3b' },
    { name: 'Purple', bg: '#e9d5ff', border: '#a855f7', text: '#581c87' },
    { name: 'Orange', bg: '#fed7aa', border: '#f97316', text: '#7c2d12' },
];

export const CustomMiniMapNode = memo(({ x, y, width, height, id }: any) => {
    const node = useStore((s) => s.nodeInternals.get(id));
    const data = node?.data || {};
    const type = node?.type || id.split('-')[0];

    // We only use foreignObject so that we can write plain HTML/Tailwind exactly like the canvas
    // We add opacity to the entire foreignObject so edges underneath can be partially visible
    return (
        <g transform={`translate(${x}, ${y})`}>
            <foreignObject width={width} height={height} style={{ overflow: 'visible', opacity: 0.85 }}>
                <div style={{ width: width, height: height }}>
                    {type === 'import' && <ImportMiniNode data={data} />}
                    {type === 'generate' && <GenerateMiniNode data={data} />}
                    {type === 'prompt' && <PromptMiniNode data={data} />}
                    {type === 'note' && <NoteMiniNode data={data} />}
                    {type === 'output' && <OutputMiniNode data={data} />}

                    {/* Fallback for unknown node types */}
                    {!['import', 'generate', 'prompt', 'note', 'output'].includes(type) && (
                        <div className="w-full h-full bg-[#1a1a1a]/90 backdrop-blur-sm border-2 border-[#2a2a2a] rounded-2xl flex items-center justify-center p-4">
                            <span className="text-white text-sm font-bold truncate pr-2">{data?.label || type}</span>
                        </div>
                    )}
                </div>
            </foreignObject>
        </g>
    );
});

CustomMiniMapNode.displayName = 'CustomMiniMapNode';

// Replicas of the actual node visuals:

function ImportMiniNode({ data }: { data: any }) {
    const image = data.supabaseUrl || data.imageUrl;
    const nodeLabel = data.nodeType === 'reference' ? 'Reference' : data.nodeType === 'source' ? 'Source' : 'Import';
    const nodeDesc = data.nodeType === 'reference' ? 'Reference Image' : 'Source Image';

    return (
        <div className="w-full h-full bg-[#1a1a1a]/90 backdrop-blur-md border-2 border-[#2a2a2a]/80 rounded-2xl flex flex-col overflow-hidden box-border">
            <div className="px-4 py-3 border-b border-[#2a2a2a]/80 flex items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-[14px] leading-tight m-0">{nodeLabel}</h3>
                        <p className="text-gray-500 text-[12px] leading-tight m-0">{nodeDesc}</p>
                    </div>
                </div>
            </div>
            <div className="p-4 flex-1">
                {image ? (
                    <img src={image} alt="" className="w-full h-40 object-cover rounded-lg" />
                ) : (
                    <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg h-40 flex flex-col items-center justify-center">
                        <Upload className="w-8 h-8 text-gray-600 mb-2" />
                        <span className="text-xs text-gray-600">Click to upload</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function GenerateMiniNode({ data }: { data: any }) {
    const status = data.status || 'idle';
    const result = data.generatedImage;
    const isThisNodeProcessing = status === 'processing';
    const aspectRatio = data.aspectRatio || '16:9';

    const getPreviewHeight = (ratio: string) => {
        switch (ratio) {
            case '16:9': return 'h-[169px]';
            case '1:1': return 'h-[300px]';
            case '4:3': return 'h-[225px]';
            case '9:16': return 'h-[533px]';
            case '21:9': return 'h-[129px]';
            default: return 'h-[180px]';
        }
    };
    const previewHeight = getPreviewHeight(aspectRatio);

    return (
        <div className="w-full h-full bg-[#1a1a1a]/90 backdrop-blur-md border-2 border-[#2a2a2a]/80 rounded-2xl flex flex-col overflow-hidden box-border">
            <div className="px-4 py-3 border-b border-[#2a2a2a]/80 flex items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-[14px] leading-tight m-0">Generate</h3>
                        <p className="text-gray-500 text-[12px] leading-tight m-0">AI Image Generation</p>
                    </div>
                </div>
            </div>
            <div className="p-3 relative">
                {result ? (
                    <img src={result} alt="" className={`w-full ${previewHeight} object-cover rounded`} />
                ) : (
                    <div className={`border border-dashed border-[#ef4444]/30 rounded ${previewHeight} flex flex-col items-center justify-center`}>
                        <Zap className="w-8 h-8 text-[#ef4444]/50 mb-2" />
                        <span className="text-[12px] text-[#666666]">Result will appear here</span>
                        <span className="text-[10px] text-[#444444] mt-1">{aspectRatio}</span>
                    </div>
                )}
            </div>
            <div className="px-3 pb-3">
                <div className="w-full flex items-center justify-center gap-2 py-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-[#ef4444] text-[12px] font-medium">
                    <Play className="w-3 h-3" />
                    Create
                </div>
            </div>
            {status === 'complete' && (
                <div className="px-3 pb-2">
                    <div className="text-[12px] text-center py-1 rounded bg-green-500/10 text-green-500">
                        ✓ Complete
                    </div>
                </div>
            )}
        </div>
    );
}

function PromptMiniNode({ data }: { data: any }) {
    const prompt = data.text || '';
    return (
        <div className="w-full h-full bg-[#1a1a1a]/90 backdrop-blur-md border-2 border-[#2a2a2a]/80 rounded-2xl flex flex-col overflow-hidden box-border">
            <div className="px-4 py-3 border-b border-[#2a2a2a]/80 flex items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 12H16M8 8H16M8 16H12M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-[14px] leading-tight m-0">Prompt</h3>
                        <p className="text-gray-500 text-[12px] leading-tight m-0">Text Input</p>
                    </div>
                </div>
            </div>
            <div className="p-4 flex-1 flex flex-col">
                <div className="w-full flex-1 bg-[#0f0f0f] border-2 border-[#2a2a2a] rounded-lg px-3 py-2 text-[14px] text-white overflow-hidden">
                    {prompt}
                </div>
                <div className="text-right text-[12px] text-gray-600 mt-2">
                    {prompt.length} / 5000 characters
                </div>
            </div>
        </div>
    );
}

function NoteMiniNode({ data }: { data: any }) {
    const colorIndex = data.colorIndex || 0;
    const currentColor = NOTE_COLORS[colorIndex] || NOTE_COLORS[0];
    const noteText = data.text || '';

    return (
        <div
            className="w-full h-full rounded-xl flex flex-col box-border backdrop-blur-md"
            style={{
                backgroundColor: currentColor.bg + 'e6', // Add transparency hex
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: currentColor.border + 'cc',
            }}
        >
            <div
                className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderColor: currentColor.border + '40' }}
            >
                <StickyNote className="w-4 h-4" style={{ color: currentColor.text }} />
                <span className="text-[14px] font-medium" style={{ color: currentColor.text }}>Note</span>
            </div>
            <div className="p-4 flex-1 overflow-hidden" style={{ color: currentColor.text, fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                {noteText}
            </div>
            <div className="text-right text-[12px] mt-2 opacity-60 pr-4 pb-4" style={{ color: currentColor.text }}>
                {noteText.length} characters
            </div>
        </div>
    );
}

function OutputMiniNode({ data }: { data: any }) {
    const images = data.images || [];
    return (
        <div className="w-full h-full bg-[#1a1a1a]/90 backdrop-blur-md border-2 border-[#2a2a2a]/80 rounded-2xl flex flex-col overflow-hidden box-border">
            <div className="px-4 py-3 border-b border-[#2a2a2a]/80 flex items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-[14px] leading-tight m-0">Output</h3>
                        <p className="text-gray-500 text-[12px] leading-tight m-0">Final Image</p>
                    </div>
                </div>
            </div>
            <div className="p-3 relative flex-1">
                {images.length > 0 ? (
                    <img src={images[0]} alt="" className="w-full h-full object-cover rounded" />
                ) : (
                    <div className="border border-dashed border-[#10b981]/30 rounded w-full h-full flex flex-col items-center justify-center">
                        <span className="text-[12px] text-[#666666]">Final image will appear here</span>
                    </div>
                )}
            </div>
        </div>
    );
}
