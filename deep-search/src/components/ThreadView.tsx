'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ThreadMessageComponent from './ThreadMessage';
import { useTranslations } from 'next-intl';
import type { ThreadMessage } from '@/lib/supabase/database';

interface ThreadViewProps {
  threadId: string;
  title: string;
  messages: ThreadMessage[];
  messageCount: number;
  provider?: string;
  // Streaming state for the latest message
  isStreaming?: boolean;
  loadingStage?: string;
  streamingContent?: string;
  streamingSources?: any[];
  streamingImages?: any[];
  streamingSearchIntent?: string | null;
  streamingRefinedQuery?: string | null;
  // Follow-up handling
  onFollowUp: (query: string) => void;
  isFollowUpDisabled?: boolean;
  streamingQuery?: string;
}

const ThreadView: React.FC<ThreadViewProps> = ({
  threadId,
  title,
  messages,
  messageCount,
  provider = 'deepseek',
  isStreaming = false,
  loadingStage = 'complete',
  streamingContent = '',
  streamingSources = [],
  streamingImages = [],
  streamingSearchIntent = null,
  streamingRefinedQuery = null,
  onFollowUp,
  isFollowUpDisabled = false,
  streamingQuery = '',
}) => {
  const t = useTranslations('search');
  const [followUpQuery, setFollowUpQuery] = useState('');
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const MAX_MESSAGES = 20;
  const isAtLimit = messageCount >= MAX_MESSAGES;

  // Auto-resize follow-up textarea
  const adjustFollowUpHeight = useCallback(() => {
    const textarea = followUpTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 80;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, []);

  useEffect(() => {
    adjustFollowUpHeight();
  }, [followUpQuery, adjustFollowUpHeight]);

  // Scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  const handleFollowUp = () => {
    const trimmed = followUpQuery.trim();
    if (!trimmed || isAtLimit || isFollowUpDisabled) return;
    onFollowUp(trimmed);
    setFollowUpQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
  };

  return (
    <div className="thread-view flex flex-col min-h-0 max-w-4xl mx-auto">
      {/* Messages — content-first, no header */}
      <div className="flex-1">
        {messages.map((msg) => (
          <ThreadMessageComponent
            key={msg.id}
            query={msg.query}
            refinedQuery={msg.refined_query}
            searchIntent={msg.search_intent}
            content={msg.content || ''}
            sources={(msg.sources || []) as any[]}
            images={(msg.images || []) as any[]}
            provider={msg.provider || provider}
            sequenceNum={msg.sequence_num}
            isLatest={false}
          />
        ))}

        {/* Currently streaming message */}
        {isStreaming && (
          <ThreadMessageComponent
            query={streamingQuery || ''}
            refinedQuery={streamingRefinedQuery}
            searchIntent={streamingSearchIntent}
            content={streamingContent}
            sources={streamingSources}
            images={streamingImages}
            provider={provider}
            sequenceNum={messageCount + 1}
            isLatest={true}
            isStreaming={true}
            loadingStage={loadingStage}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Thread Limit Banner */}
      {isAtLimit && (
        <div className="my-4 mx-6 p-4 bg-amber-500/10 rounded-xl text-center">
          <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
            This thread has reached the {MAX_MESSAGES}-message limit.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Start a new search to continue exploring this topic.
          </p>
        </div>
      )}

      {/* Spacer for floating follow-up */}
      <div className="h-20" />

      {/* Gradient fade above follow-up input */}
      <div className="fixed bottom-[52px] left-0 right-0 h-16 bg-gradient-to-t from-[var(--background)] to-transparent pointer-events-none z-30 md:ml-[72px] print:hidden" />

      {/* Fixed Follow-up Input — minimal flat design */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--background)] py-3 px-4 md:pl-[calc(72px+16px)] print:hidden">
        <div className="flex items-end gap-2 max-w-4xl mx-auto bg-[var(--card)] rounded-2xl border border-[var(--border)] px-4 py-2">
          <textarea
            ref={followUpTextareaRef}
            rows={1}
            placeholder={isAtLimit ? 'Thread limit reached' : t('followUp')}
            value={followUpQuery}
            onChange={(e) => setFollowUpQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAtLimit || isFollowUpDisabled}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none text-sm resize-none overflow-y-auto scrollbar-thin min-h-[24px] py-1 disabled:opacity-50 placeholder:text-[var(--text-muted)]"
          />
          <button
            onClick={handleFollowUp}
            disabled={!followUpQuery.trim() || isAtLimit || isFollowUpDisabled}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--background)] flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-80"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)] md:hidden" />
      </div>
    </div>
  );
};

export default ThreadView;
