'use client';

import { Play, Square, Save, Trash2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { executeWorkflow } from '@/lib/workflow/executor';
import toast from 'react-hot-toast';

export function ExecutionPanel() {
  const {
    nodes,
    edges,
    executionStatus,
    setExecutionStatus,
    clearWorkflow,
  } = useWorkflowStore();

  const handleExecute = async () => {
    if (executionStatus === 'running') {
      toast.error('Workflow is already running');
      return;
    }

    if (nodes.length === 0) {
      toast.error('Add some nodes first');
      return;
    }

    try {
      setExecutionStatus('running');
      toast.loading('Executing workflow...', { id: 'workflow-execution' });
      
      await executeWorkflow(nodes, edges);
      
      setExecutionStatus('complete');
      toast.success('Workflow completed!', { id: 'workflow-execution' });
    } catch (error) {
      setExecutionStatus('error');
      toast.error(
        error instanceof Error ? error.message : 'Workflow execution failed',
        { id: 'workflow-execution' }
      );
    }
  };

  const handleStop = () => {
    setExecutionStatus('idle');
    toast.success('Workflow stopped');
  };

  const handleClear = () => {
    if (confirm('Clear entire workflow? This cannot be undone.')) {
      clearWorkflow();
      toast.success('Workflow cleared');
    }
  };

  const handleSave = () => {
    // TODO: Implement save to Supabase
    toast.success('Save feature coming soon!');
  };

  return (
    <div className="h-16 bg-[#1a1a1a] border-b border-gray-800 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">Workflow Editor</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            executionStatus === 'idle' ? 'bg-gray-500' :
            executionStatus === 'running' ? 'bg-amber-500 animate-pulse' :
            executionStatus === 'complete' ? 'bg-green-500' :
            'bg-red-500'
          }`} />
          <span className="text-sm text-gray-400 capitalize">{executionStatus}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {executionStatus === 'running' ? (
          <motion.button
            onClick={handleStop}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop
          </motion.button>
        ) : (
          <motion.button
            onClick={handleExecute}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={nodes.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(executionStatus as string) === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run Workflow
          </motion.button>
        )}

        <button
          onClick={handleSave}
          className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          Save
        </button>

        <button
          onClick={handleClear}
          disabled={nodes.length === 0}
          className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-300 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
      </div>
    </div>
  );
}
