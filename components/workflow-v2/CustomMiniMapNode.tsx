import React, { memo } from 'react';
import { useStore } from 'reactflow';
import { Zap, Play, Upload, Clapperboard, StickyNote, MoreVertical, MonitorPlay } from 'lucide-react';

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

    return (
        <g transform={`translate(${x}, ${y})`}>
            <foreignObject width={width} height={height} style={{ overflow: 'visible', opacity: 0.9 }}>
                <div style={{ width: width, height: height }}>
                    {type === 'import' && <ImportMiniNode data={data} />}
                    {type === 'generate' && <GenerateMiniNode data={data} />}
                    {type === 'videoGenerate' && <VideoGenerateMiniNode data={data} />}
                    {type === 'prompt' && <PromptMiniNode data={data} />}
                    {type === 'note' && <NoteMiniNode data={data} />}
                    {type === 'output' && <OutputMiniNode data={data} />}

                    {!['import', 'generate', 'videoGenerate', 'prompt', 'note', 'output'].includes(type) && (
                        <div className="workflow-node-card w-full h-full bg-[#1a1a1a]/90 backdrop-blur-sm border-2 border-[#2a2a2a] rounded-2xl flex flex-col">
                            <div className="px-4 py-3"><h3 className="text-white text-sm font-bold truncate pr-2">{data?.label || type}</h3></div>
                        </div>
                    )}
                </div>
            </foreignObject>
        </g>
    );
});

CustomMiniMapNode.displayName = 'CustomMiniMapNode';

function NodeHeader({ title, subtitle, icon, iconGradient }: any) {
    return (
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-lg`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-white font-semibold text-sm">{title}</h3>
                        <p className="text-gray-500 text-xs">{subtitle}</p>
                    </div>
                </div>
                <div className="relative nodrag nopan">
                    <button className="workflow-node-menu-button nodrag nopan text-[#666666] hover:text-white transition-colors">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function ImportMiniNode({ data }: { data: any }) {
    const image = data.supabaseUrl || data.imageUrl;
    const nodeLabel = data.nodeType === 'reference' ? 'Reference' : data.nodeType === 'source' ? 'Source' : 'Import';

    return (
        <div className="workflow-node-card w-full h-full bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl flex flex-col overflow-hidden box-border shadow-xl">
            <NodeHeader 
                title={nodeLabel} 
                subtitle="Reference image" 
                iconGradient="from-blue-500 to-indigo-600"
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            />
            <div className="p-4 flex-1 min-h-0 flex flex-col">
                {image ? (
                    <img src={image} alt="" className="w-full h-full object-contain rounded-lg flex-1 min-h-0" />
                ) : (
                    <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg h-full w-full flex-1 flex flex-col items-center justify-center min-h-0">
                        <Upload className="w-8 h-8 text-gray-600 mb-2" />
                        <span className="text-xs text-gray-600">Click to upload</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function GenerateMiniNode({ data }: { data: any }) {
    const result = data.generatedImage;
    const aspectRatio = data.aspectRatio || '16:9';

    return (
        <div className="workflow-node-card w-full h-full bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl flex flex-col overflow-hidden box-border shadow-xl">
            <NodeHeader 
                title="Generate" 
                subtitle="AI Image Generation" 
                iconGradient="from-orange-500 to-red-600"
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            />
            <div className="p-3 relative flex-1 min-h-0 flex flex-col">
                {result ? (
                    <img src={result} alt="" className="w-full h-full object-cover rounded flex-1 min-h-0" />
                ) : (
                    <div className="border border-dashed border-[#ef4444]/30 rounded flex-1 w-full h-full flex flex-col items-center justify-center min-h-0">
                        <Zap className="w-8 h-8 text-[#ef4444]/50 mb-2" />
                        <span className="text-[12px] text-[#666666]">Result will appear here</span>
                        <span className="text-[10px] text-[#444444] mt-1">{aspectRatio}</span>
                    </div>
                )}
            </div>
            <div className="px-3 pb-3">
                <button className="w-full flex items-center justify-center gap-2 py-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-[#ef4444] text-xs font-medium">
                    <Play className="w-3 h-3" />
                    Create
                </button>
            </div>
        </div>
    );
}

function VideoGenerateMiniNode({ data }: { data: any }) {
    const result = data.generatedVideo;
    const aspectRatio = data.aspectRatio || '16:9';

    return (
        <div className="workflow-node-card w-full h-full bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl flex flex-col overflow-hidden box-border shadow-xl">
            <NodeHeader 
                title="Video Generate" 
                subtitle="AI Video Generation" 
                iconGradient="from-purple-500 to-indigo-600"
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="2" /><path d="M2 8H22" stroke="white" strokeWidth="2" /><circle cx="5" cy="6" r="1" fill="white" /><circle cx="8" cy="6" r="1" fill="white" /></svg>}
            />
            <div className="p-3 relative flex-1 min-h-0 flex flex-col">
                {result ? (
                    <div className="w-full h-full bg-gray-800 rounded flex-1 min-h-0" />
                ) : (
                    <div className="border border-dashed border-[#a855f7]/30 rounded flex-1 w-full h-full flex flex-col items-center justify-center min-h-0">
                        <Clapperboard className="w-8 h-8 text-[#a855f7]/50 mb-2" />
                        <span className="text-[12px] text-[#666666]">Video will appear here</span>
                        <span className="text-[10px] text-[#444444] mt-1">{aspectRatio}</span>
                    </div>
                )}
            </div>
            <div className="px-3 pb-3">
                <button className="w-full flex items-center justify-center gap-2 py-2 bg-purple-500/10 border border-purple-500/30 rounded text-purple-400 text-xs font-medium">
                    <Play className="w-3 h-3" />
                    Create Video
                </button>
            </div>
        </div>
    );
}

function PromptMiniNode({ data }: { data: any }) {
    const prompt = data.text || '';
    return (
        <div className="workflow-node-card w-full h-full bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl flex flex-col overflow-hidden box-border shadow-xl">
            <NodeHeader 
                title="Prompt" 
                subtitle="Text Input" 
                iconGradient="from-purple-500 to-pink-600"
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 12H16M8 8H16M8 16H12M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            />
            <div className="p-4 flex-1 flex flex-col">
                <textarea 
                    className="w-full h-full resize-none bg-transparent border-0 text-gray-200 outline-none placeholder:text-[#444444] text-[14px]"
                    value={prompt}
                    placeholder={data.placeholder || "Describe the style, mood, and composition you want.\nE.g. 'Professional product shot, soft studio lighting, clean white background, high detail, 8K resolution'"}
                    readOnly
                />
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
            className="workflow-note-card w-full h-full rounded-2xl flex flex-col box-border backdrop-blur-md shadow-xl"
            style={{
                backgroundColor: currentColor.bg + 'e6',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: currentColor.border + 'cc',
            }}
        >
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: currentColor.border + '40' }}>
                <div className="flex items-center gap-2">
                    <StickyNote className="w-4 h-4" style={{ color: currentColor.text }} />
                    <span className="text-sm font-medium" style={{ color: currentColor.text }}>Note</span>
                </div>
            </div>
            <div className="p-4 flex-1 flex flex-col">
                <textarea 
                    className="w-full flex-1 bg-transparent border-none rounded-lg px-0 py-0 text-sm placeholder:opacity-50 focus:outline-none resize-none"
                    value={noteText}
                    placeholder="Write your notes here...&#10;&#10;• Ideas&#10;• Reminders&#10;• Documentation"
                    style={{ color: currentColor.text }}
                    readOnly
                />
            </div>
        </div>
    );
}

function OutputMiniNode({ data }: { data: any }) {
    const images = data.images || [];
    return (
        <div className="workflow-node-card w-full h-full bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl flex flex-col overflow-hidden box-border shadow-xl">
            <NodeHeader 
                title="Output" 
                subtitle="Final Image" 
                iconGradient="from-emerald-500 to-teal-600"
                icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            />
            <div className="p-4 flex-1 min-h-0 flex flex-col">
                {images.length > 0 ? (
                    <img src={images[0]} alt="" className="w-full h-full object-cover rounded-lg flex-1 min-h-0" />
                ) : (
                    <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg h-full flex-1 flex flex-col items-center justify-center min-h-[160px]">
                        <MonitorPlay className="w-8 h-8 text-gray-600 mb-2" />
                        <span className="text-xs text-gray-600">Waiting for results...</span>
                    </div>
                )}
            </div>
        </div>
    );
}
