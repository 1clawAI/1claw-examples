/**
 * Minimal types for the Google Agent-to-Agent (A2A) protocol.
 * See: https://google.github.io/A2A/
 */

export interface AgentCard {
    name: string;
    description: string;
    url: string;
    version: string;
    capabilities: {
        streaming: boolean;
        pushNotifications: boolean;
        stateTransitionHistory: boolean;
    };
    skills: AgentSkill[];
}

export interface AgentSkill {
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples?: string[];
}

export type TaskState =
    | "submitted"
    | "working"
    | "input-required"
    | "completed"
    | "canceled"
    | "failed";

export interface Task {
    id: string;
    sessionId: string;
    status: TaskStatus;
    messages: Message[];
    artifacts?: Artifact[];
}

export interface TaskStatus {
    state: TaskState;
    message?: Message;
    timestamp: string;
}

export interface Message {
    role: "user" | "agent";
    parts: Part[];
}

export type Part = TextPart | DataPart;

export interface TextPart {
    type: "text";
    text: string;
}

export interface DataPart {
    type: "data";
    data: Record<string, unknown>;
}

export interface Artifact {
    name: string;
    description?: string;
    parts: Part[];
}

export interface SendTaskRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: "tasks/send";
    params: {
        id: string;
        sessionId?: string;
        message: Message;
    };
}

export interface SendTaskResponse {
    jsonrpc: "2.0";
    id: string | number;
    result: Task;
}
