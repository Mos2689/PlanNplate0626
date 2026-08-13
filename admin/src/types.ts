export type SupportIntent = 'bug' | 'question' | 'idea';
export type SupportStatus = 'new' | 'open' | 'resolved';

export interface Thread {
  id: string;
  user_id: string;
  type: SupportIntent;
  status: SupportStatus;
  subject: string;
  feature: string | null;
  context: Record<string, unknown>;
  last_message_at: string;
  unread_for_user: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  author: 'user' | 'agent';
  agent_id: string | null;
  body: string;
  attachments: { path: string; width: number; height: number; bytes: number }[];
  created_at: string;
}

export const INTENT_LABEL: Record<SupportIntent, string> = {
  bug: 'Not working',
  question: 'Question',
  idea: 'Idea',
};

export const STATUS_LABEL: Record<SupportStatus, string> = {
  new: 'New',
  open: 'Open',
  resolved: 'Resolved',
};
