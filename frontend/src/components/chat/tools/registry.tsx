import type { ToolComponent } from '@/types';
import { Task } from './Task';
import { WebSearch } from './WebSearch';
import { TodoWrite } from './TodoWrite';
import { MCPTool } from './MCPTool';
import { WriteTool, ReadTool, EditTool } from './FileOperationTool';
import { AskUserQuestion } from './AskUserQuestion';
import { BashTool } from './BashTool';
import { GlobTool } from './GlobTool';
import { GrepTool } from './GrepTool';
import { NotebookEditTool } from './NotebookEditTool';
import { WebFetchTool } from './WebFetchTool';
import { LSPTool } from './LSPTool';
import { TaskOutputTool, BashOutputTool } from './TaskOutputTool';
import { KillShellTool } from './KillShellTool';
import { EnterPlanModeTool, ExitPlanModeTool } from './PlanModeTool';

export const TOOL_COMPONENTS: Record<string, ToolComponent> = {
  Task: Task,
  WebSearch: WebSearch,
  TodoWrite: TodoWrite,
  Write: WriteTool,
  Read: ReadTool,
  Edit: EditTool,
  AskUserQuestion: AskUserQuestion,
  Bash: BashTool,
  Glob: GlobTool,
  Grep: GrepTool,
  NotebookEdit: NotebookEditTool,
  WebFetch: WebFetchTool,
  LSP: LSPTool,
  TaskOutput: TaskOutputTool,
  BashOutput: BashOutputTool,
  KillShell: KillShellTool,
  EnterPlanMode: EnterPlanModeTool,
  ExitPlanMode: ExitPlanModeTool,
};

export const getToolComponent = (toolName: string): ToolComponent => {
  if (TOOL_COMPONENTS[toolName]) {
    return TOOL_COMPONENTS[toolName];
  }

  if (
    toolName.startsWith('mcp__web-search-prime__') ||
    toolName.startsWith('mcp__web_search_prime__')
  ) {
    return WebSearch;
  }

  return MCPTool;
};
