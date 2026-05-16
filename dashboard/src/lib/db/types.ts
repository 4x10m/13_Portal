// ── Types for the AxiiomLab Dashboard DB ──

export type ProjectStatus = "idea" | "in-progress" | "done" | "on-hold";
export type ProjectPriority = "low" | "medium" | "high" | "critical";
export type ProjectCategory = "infra" | "ai" | "apps" | "perso" | "devops" | "general";
export type MilestoneStatus = "pending" | "in-progress" | "done";
export type TaskStatus = "todo" | "in-progress" | "done" | "blocked";

export interface ProjectDB {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  category: ProjectCategory;
  assigned_agent: string;
  docker_containers: string;  // JSON
  domains: string;            // JSON
  databases: string;          // JSON
  opencode_sessions: string;  // JSON
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  category: ProjectCategory;
  assigned_agent: string;
  docker_containers: string[];
  domains: string[];
  databases: { type: string; name: string }[];
  opencode_sessions: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  milestone_count: number;
  task_count: number;
}

export interface ProjectWithMilestones extends ProjectWithStats {
  milestones: MilestoneWithTasks[];
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneWithTasks extends Milestone {
  tasks: Task[];
}

export interface Task {
  id: string;
  milestone_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Link {
  id: string;
  task_id: string | null;
  project_id: string | null;
  url: string;
  label: string;
  created_at: string;
}

// ── Create payloads ──

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  category?: ProjectCategory;
  assigned_agent?: string;
  docker_containers?: string[];
  domains?: string[];
  databases?: { type: string; name: string }[];
  opencode_sessions?: string[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  category?: ProjectCategory;
  assigned_agent?: string;
  docker_containers?: string[];
  domains?: string[];
  databases?: { type: string; name: string }[];
  opencode_sessions?: string[];
}

export interface CreateMilestoneInput {
  project_id: string;
  title: string;
  description?: string;
  status?: MilestoneStatus;
  due_date?: string;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  status?: MilestoneStatus;
  due_date?: string | null;
}

export interface CreateTaskInput {
  milestone_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string;
  sort_order?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string;
  sort_order?: number;
}

export interface CreateLinkInput {
  task_id?: string;
  project_id?: string;
  url: string;
  label: string;
}
