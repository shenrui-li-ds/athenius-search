import { createClient } from './client';
import type { SearchThread, ThreadMessage, ThreadInsert, ThreadMessageInsert } from './database';

/**
 * Create a new search thread.
 * Title is auto-generated from the first query (truncated to 60 chars).
 */
export async function createThread(insert: ThreadInsert): Promise<SearchThread | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn('No user logged in, skipping thread creation');
    return null;
  }

  // Truncate title to 60 characters with ellipsis
  const title = insert.title.length > 60
    ? insert.title.slice(0, 57) + '...'
    : insert.title;

  const { data, error } = await supabase
    .from('search_threads')
    .insert({
      user_id: user.id,
      title,
      mode: insert.mode || 'web',
      provider: insert.provider,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating thread:', error);
    throw error;
  }

  return data;
}

/**
 * Get a thread by ID (excludes soft-deleted).
 */
export async function getThread(threadId: string): Promise<SearchThread | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('search_threads')
    .select('*')
    .eq('id', threadId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching thread:', error);
    throw error;
  }

  return data;
}

/**
 * Get all messages for a thread, ordered by sequence number.
 */
export async function getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('thread_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('sequence_num', { ascending: true });

  if (error) {
    console.error('Error fetching thread messages:', error);
    throw error;
  }

  return data || [];
}

/**
 * Add a message to a thread.
 * sequence_num should be message_count + 1 at time of creation.
 */
export async function addMessage(insert: ThreadMessageInsert): Promise<ThreadMessage | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('thread_messages')
    .insert({
      thread_id: insert.thread_id,
      sequence_num: insert.sequence_num,
      query: insert.query,
      refined_query: insert.refined_query || null,
      provider: insert.provider,
      content: insert.content || null,
      sources: insert.sources || [],
      images: insert.images || [],
      search_intent: insert.search_intent || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding thread message:', error.message, 'code:', error.code, 'details:', error.details, 'hint:', error.hint);
    throw error;
  }

  return data;
}

/**
 * Update the rolling thread summary.
 * Uses last-write-wins semantics for concurrent access (multiple tabs).
 */
export async function updateThreadSummary(threadId: string, summary: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('search_threads')
    .update({
      thread_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  if (error) {
    console.error('Error updating thread summary:', error);
    throw error;
  }
}

/**
 * Soft delete a thread (sets deleted_at, recoverable).
 */
export async function deleteThread(threadId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('search_threads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', threadId);

  if (error) {
    console.error('Error deleting thread:', error);
    throw error;
  }
}

/**
 * Toggle bookmark status on a thread.
 */
export async function bookmarkThread(threadId: string): Promise<boolean> {
  const supabase = createClient();

  // Get current status
  const { data: thread, error: fetchError } = await supabase
    .from('search_threads')
    .select('bookmarked')
    .eq('id', threadId)
    .single();

  if (fetchError) {
    console.error('Error fetching thread bookmark:', fetchError);
    throw fetchError;
  }

  const newStatus = !thread.bookmarked;

  const { error } = await supabase
    .from('search_threads')
    .update({ bookmarked: newStatus })
    .eq('id', threadId);

  if (error) {
    console.error('Error toggling thread bookmark:', error);
    throw error;
  }

  return newStatus;
}

/**
 * Get user's threads for Library display.
 * Sorted by updated_at DESC (most recently active first).
 * Excludes soft-deleted threads.
 */
export async function getUserThreads(limit = 50, offset = 0): Promise<SearchThread[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('search_threads')
    .select('*')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching user threads:', error);
    throw error;
  }

  return data || [];
}

/**
 * Clean up empty threads older than 1 hour.
 * Called on Library load.
 */
export async function cleanupEmptyThreads(): Promise<void> {
  const supabase = createClient();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('search_threads')
    .delete()
    .eq('message_count', 0)
    .lt('created_at', oneHourAgo);

  if (error) {
    console.error('Error cleaning up empty threads:', error);
    // Non-critical — don't throw
  }
}
